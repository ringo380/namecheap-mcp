# Changelog

## [1.2.0] — 2026-04-03

### Added
- `register_domain` — purchase a new domain with registrant contact info
- `get_domain_contacts` — read WHOIS contact info for a domain
- `set_domain_contacts` — update registrant/tech/admin/billing contacts
- `reactivate_domain` — recover a recently expired domain
- `renew_whoisguard` — renew WHOIS privacy protection independently of domain renewal
- `transfer_domain` — initiate an inbound transfer with EPP code
- `get_transfer_status` — check transfer status by ID
- `list_transfers` — list all transfers, filterable by status
- `get_ssl_info` — get details for a specific SSL certificate
- `activate_ssl` — activate a purchased certificate by submitting a CSR; supports email, HTTP file, and CNAME DCV methods
- `reissue_ssl` — reissue a certificate with a new CSR

### Fixed
- Upgraded `fast-xml-parser` from `^4.4.0` to `^5.5.7` to address a moderate security vulnerability

## [1.1.0] — 2026-03-xx

### Added
- `update_dns_record` — safe single-record add/update/delete (read-modify-write) without affecting other records
- `set_domain_autorenew` — enable or disable auto-renewal
- `set_registrar_lock` — lock or unlock domain transfer
- `set_whoisguard` — enable or disable WHOIS privacy
- `get_pricing` — query pricing for domains, SSL, or Whois Guard
- `get_tld_list` — browse supported TLDs with `search` and `registerable` filters

### Changed
- Cleaned up all tool outputs — structured JSON instead of raw API responses
- `get_domain_info` now returns a flattened, human-readable object

## [1.0.0] — Initial release

- `setup` — interactive credential configuration (MCP elicitation or standalone CLI)
- `check_domains` — availability check for one or more domains
- `list_domains` — paginated domain list with status filtering
- `get_domain_info` — full domain details
- `renew_domain` — renew a domain for 1–10 years
- `get_dns_hosts` — read all DNS records
- `set_dns_hosts` — replace all DNS records
- `set_dns_default` — revert to Namecheap nameservers
- `set_dns_custom` — set custom nameservers
- `get_email_forwarding` / `set_email_forwarding` — email forwarding rules
- `list_ssl_certs` / `create_ssl_cert` — SSL certificate management
- `get_balances` — account balance
