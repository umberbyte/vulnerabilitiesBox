#!/bin/sh
set -eu
mkdir -p /tmp/ldap-db
exec slapd -f /opt/benchmark/src/ldap/slapd.conf -h 'ldap://0.0.0.0:1389/' -d 0
