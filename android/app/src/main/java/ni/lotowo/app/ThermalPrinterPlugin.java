package ni.lotowo.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT }
        ),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class ThermalPrinterPlugin extends Plugin {
    private static final UUID SERIAL_PORT_PROFILE = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService connectionMonitorExecutor = Executors.newCachedThreadPool();
    private final Map<String, BluetoothDevice> discoveredDevices = new LinkedHashMap<>();
    private volatile BluetoothSocket socket;
    private volatile OutputStream output;
    private volatile String connectedDeviceId;
    private volatile String connectedDeviceName;
    private BroadcastReceiver discoveryReceiver;
    private BroadcastReceiver connectionReceiver;
    private PluginCall discoveryCall;

    @Override
    public void load() {
        registerConnectionReceiver();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", adapter() != null);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (hasPrinterPermissions()) {
            resolvePermission(call);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissionForAlias("bluetooth", call, "permissionsCallback");
        } else {
            requestPermissionForAlias("location", call, "permissionsCallback");
        }
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        resolvePermission(call);
    }

    @PluginMethod
    public void getPairedDevices(PluginCall call) {
        BluetoothAdapter adapter = requireAdapter(call);
        if (adapter == null || !requirePermissions(call)) return;
        try {
            JSArray devices = new JSArray();
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            for (BluetoothDevice device : bonded) devices.put(deviceJson(device, true));
            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (SecurityException exception) {
            call.reject("Suerte no tiene permiso para leer los dispositivos Bluetooth.", exception);
        }
    }

    @PluginMethod
    public void discoverDevices(PluginCall call) {
        BluetoothAdapter adapter = requireAdapter(call);
        if (adapter == null || !requirePermissions(call)) return;
        stopDiscovery(false);
        discoveredDevices.clear();
        try {
            for (BluetoothDevice device : adapter.getBondedDevices()) {
                discoveredDevices.put(device.getAddress(), device);
            }
            discoveryCall = call;
            discoveryReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String action = intent.getAction();
                    if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                        BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                        if (device != null) discoveredDevices.put(device.getAddress(), device);
                    } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
                        finishDiscovery();
                    }
                }
            };
            IntentFilter filter = new IntentFilter();
            filter.addAction(BluetoothDevice.ACTION_FOUND);
            filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                getContext().registerReceiver(discoveryReceiver, filter, Context.RECEIVER_EXPORTED);
            } else {
                getContext().registerReceiver(discoveryReceiver, filter);
            }
            if (!adapter.startDiscovery()) {
                stopDiscovery(false);
                call.reject("No se pudo iniciar la búsqueda Bluetooth.");
                discoveryCall = null;
            }
        } catch (SecurityException exception) {
            stopDiscovery(false);
            discoveryCall = null;
            call.reject("Suerte no tiene permiso para buscar dispositivos Bluetooth.", exception);
        }
    }

    @PluginMethod
    public void pair(PluginCall call) {
        String address = call.getString("deviceId");
        BluetoothAdapter adapter = requireAdapter(call);
        if (adapter == null || !requirePermissions(call) || address == null) {
            if (address == null) call.reject("Falta el identificador de la impresora.");
            return;
        }
        ioExecutor.execute(() -> {
            try {
                BluetoothDevice device = adapter.getRemoteDevice(address);
                if (device.getBondState() != BluetoothDevice.BOND_BONDED) {
                    if (!device.createBond()) throw new IOException("No se pudo iniciar la vinculación.");
                    long deadline = System.currentTimeMillis() + 20_000;
                    while (device.getBondState() == BluetoothDevice.BOND_BONDING && System.currentTimeMillis() < deadline) {
                        Thread.sleep(250);
                    }
                }
                JSObject result = new JSObject();
                result.put("paired", device.getBondState() == BluetoothDevice.BOND_BONDED);
                if (device.getBondState() == BluetoothDevice.BOND_BONDED) call.resolve(result);
                else call.reject("La impresora no aceptó la vinculación.");
            } catch (Exception exception) {
                call.reject("No se pudo vincular la impresora.", exception);
            }
        });
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("deviceId");
        BluetoothAdapter adapter = requireAdapter(call);
        if (adapter == null || !requirePermissions(call) || address == null) {
            if (address == null) call.reject("Falta el identificador de la impresora.");
            return;
        }
        if (isConnected() && address.equals(connectedDeviceId)) {
            call.resolve(status());
            return;
        }
        ioExecutor.execute(() -> {
            closeConnection(false);
            try {
                adapter.cancelDiscovery();
                BluetoothDevice device = adapter.getRemoteDevice(address);
                BluetoothSocket candidate = device.createInsecureRfcommSocketToServiceRecord(SERIAL_PORT_PROFILE);
                try {
                    candidate.connect();
                } catch (IOException insecureError) {
                    try { candidate.close(); } catch (IOException ignored) {}
                    candidate = device.createRfcommSocketToServiceRecord(SERIAL_PORT_PROFILE);
                    candidate.connect();
                }
                socket = candidate;
                output = candidate.getOutputStream();
                connectedDeviceId = address;
                connectedDeviceName = safeName(device);
                monitorConnection(candidate);
                notifyStatus(null);
                call.resolve(status());
            } catch (Exception exception) {
                closeConnection(false);
                notifyStatus("No se pudo conectar con la impresora.");
                call.reject("No se pudo conectar con la impresora.", exception);
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        ioExecutor.execute(() -> {
            closeConnection(true);
            call.resolve();
        });
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void print(PluginCall call) {
        String encoded = call.getString("data");
        if (encoded == null) {
            call.reject("El recibo no contiene datos para imprimir.");
            return;
        }
        ioExecutor.execute(() -> {
            if (!isConnected() || output == null) {
                call.reject("La impresora está desconectada.");
                notifyStatus("La impresora está desconectada.");
                return;
            }
            try {
                byte[] data = Base64.decode(encoded, Base64.DEFAULT);
                int offset = 0;
                while (offset < data.length) {
                    int length = Math.min(512, data.length - offset);
                    output.write(data, offset, length);
                    offset += length;
                }
                output.flush();
                call.resolve();
            } catch (Exception exception) {
                closeConnection(false);
                notifyStatus("Se perdió la conexión con la impresora.");
                call.reject("Se perdió la conexión durante la impresión.", exception);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        stopDiscovery(true);
        unregisterConnectionReceiver();
        closeConnection(false);
        ioExecutor.shutdownNow();
        connectionMonitorExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    private BluetoothAdapter adapter() {
        return BluetoothAdapter.getDefaultAdapter();
    }

    private BluetoothAdapter requireAdapter(PluginCall call) {
        BluetoothAdapter adapter = adapter();
        if (adapter == null) call.reject("Este teléfono no dispone de Bluetooth.");
        else if (!adapter.isEnabled()) {
            call.reject("Activa Bluetooth para conectar la impresora.");
            return null;
        }
        return adapter;
    }

    private boolean requirePermissions(PluginCall call) {
        if (hasPrinterPermissions()) return true;
        call.reject("Suerte necesita permiso de Bluetooth para conectar la impresora.");
        return false;
    }

    private boolean hasPrinterPermissions() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? getPermissionState("bluetooth") == PermissionState.GRANTED
            : getPermissionState("location") == PermissionState.GRANTED;
    }

    private void resolvePermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasPrinterPermissions());
        call.resolve(result);
    }

    private JSObject deviceJson(BluetoothDevice device, boolean bonded) {
        JSObject item = new JSObject();
        item.put("id", device.getAddress());
        item.put("name", safeName(device));
        item.put("bonded", bonded || device.getBondState() == BluetoothDevice.BOND_BONDED);
        return item;
    }

    private String safeName(BluetoothDevice device) {
        try {
            String name = device.getName();
            return name == null || name.trim().isEmpty() ? "Impresora Bluetooth" : name;
        } catch (SecurityException ignored) {
            return "Impresora Bluetooth";
        }
    }

    private void finishDiscovery() {
        PluginCall call = discoveryCall;
        discoveryCall = null;
        stopDiscovery(false);
        if (call == null) return;
        JSArray devices = new JSArray();
        for (BluetoothDevice device : discoveredDevices.values()) devices.put(deviceJson(device, false));
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    private void stopDiscovery(boolean rejectPending) {
        BluetoothAdapter adapter = adapter();
        try { if (adapter != null && adapter.isDiscovering()) adapter.cancelDiscovery(); } catch (SecurityException ignored) {}
        if (discoveryReceiver != null) {
            try { getContext().unregisterReceiver(discoveryReceiver); } catch (Exception ignored) {}
            discoveryReceiver = null;
        }
        if (rejectPending && discoveryCall != null) discoveryCall.reject("La búsqueda fue cancelada.");
        if (rejectPending) discoveryCall = null;
    }

    private boolean isConnected() {
        return socket != null && socket.isConnected() && output != null;
    }

    private void registerConnectionReceiver() {
        if (connectionReceiver != null) return;
        connectionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (BluetoothAdapter.ACTION_STATE_CHANGED.equals(action)) {
                    int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR);
                    if (state != BluetoothAdapter.STATE_ON) markConnectionLost("Bluetooth está desactivado.", null);
                    return;
                }
                if (!BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(action)
                    && !BluetoothDevice.ACTION_ACL_DISCONNECT_REQUESTED.equals(action)) return;
                BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                String address = null;
                try { if (device != null) address = device.getAddress(); } catch (SecurityException ignored) {}
                markConnectionLost("La impresora está desconectada.", address);
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(BluetoothAdapter.ACTION_STATE_CHANGED);
        filter.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        filter.addAction(BluetoothDevice.ACTION_ACL_DISCONNECT_REQUESTED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(connectionReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(connectionReceiver, filter);
        }
    }

    private void unregisterConnectionReceiver() {
        if (connectionReceiver == null) return;
        try { getContext().unregisterReceiver(connectionReceiver); } catch (Exception ignored) {}
        connectionReceiver = null;
    }

    private void monitorConnection(BluetoothSocket monitoredSocket) {
        connectionMonitorExecutor.execute(() -> {
            try {
                InputStream input = monitoredSocket.getInputStream();
                byte[] response = new byte[64];
                while (socket == monitoredSocket) {
                    if (input.read(response) < 0) throw new IOException("El canal Bluetooth fue cerrado.");
                }
            } catch (Exception exception) {
                if (socket == monitoredSocket) {
                    markConnectionLost("Se perdió la conexión con la impresora.", null, monitoredSocket);
                }
            }
        });
    }

    private void markConnectionLost(String message, String deviceAddress) {
        markConnectionLost(message, deviceAddress, socket);
    }

    private void markConnectionLost(String message, String deviceAddress, BluetoothSocket expectedSocket) {
        String currentAddress = connectedDeviceId;
        if (expectedSocket == null || currentAddress == null
            || (deviceAddress != null && !deviceAddress.equals(currentAddress))) return;
        ioExecutor.execute(() -> {
            if (socket != expectedSocket || connectedDeviceId == null
                || (deviceAddress != null && !deviceAddress.equals(connectedDeviceId))) return;
            closeConnection(false);
            notifyStatus(message);
        });
    }

    private JSObject status() {
        JSObject status = new JSObject();
        status.put("connected", isConnected());
        if (connectedDeviceId != null) status.put("deviceId", connectedDeviceId);
        if (connectedDeviceName != null) status.put("deviceName", connectedDeviceName);
        return status;
    }

    private void notifyStatus(String message) {
        JSObject status = status();
        if (message != null) status.put("message", message);
        notifyListeners("statusChanged", status);
    }

    private void closeConnection(boolean notify) {
        if (output != null) {
            try { output.close(); } catch (IOException ignored) {}
        }
        if (socket != null) {
            try { socket.close(); } catch (IOException ignored) {}
        }
        output = null;
        socket = null;
        connectedDeviceId = null;
        connectedDeviceName = null;
        if (notify) notifyStatus(null);
    }
}
