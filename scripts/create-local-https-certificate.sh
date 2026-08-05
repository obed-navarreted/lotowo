#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "${script_dir}/.." && pwd)"
certificate_dir="${project_dir}/.certs"

mkdir -p "${certificate_dir}"

openssl ecparam -name prime256v1 -genkey -noout -out "${certificate_dir}/lotowo-local-ca.key"
openssl req -x509 -new -sha256 -days 3650 \
  -key "${certificate_dir}/lotowo-local-ca.key" \
  -out "${certificate_dir}/lotowo-local-ca.crt" \
  -subj "/CN=Lotowo Local CA/O=Lotowo"

openssl ecparam -name prime256v1 -genkey -noout -out "${certificate_dir}/lotowo-local.key"
openssl req -new -sha256 \
  -key "${certificate_dir}/lotowo-local.key" \
  -out "${certificate_dir}/lotowo-local.csr" \
  -subj "/CN=lotowo.local/O=Lotowo" \
  -addext "subjectAltName=DNS:localhost,DNS:lotowo.local,IP:127.0.0.1,IP:192.168.100.12,IP:192.168.100.18"
openssl x509 -req -sha256 -days 825 \
  -in "${certificate_dir}/lotowo-local.csr" \
  -CA "${certificate_dir}/lotowo-local-ca.crt" \
  -CAkey "${certificate_dir}/lotowo-local-ca.key" \
  -CAcreateserial \
  -copy_extensions copy \
  -out "${certificate_dir}/lotowo-local.crt"

rm -f "${certificate_dir}/lotowo-local.csr" "${certificate_dir}/lotowo-local-ca.srl"
chmod 600 "${certificate_dir}"/*.key

echo "Certificados creados en ${certificate_dir}."
echo "Instala lotowo-local-ca.crt como autoridad confiable en cada dispositivo que usará Web Push."
