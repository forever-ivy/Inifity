# n8n Credentials Map (V2)

Create credentials in n8n with these names:

- `cred_imap`: IMAP account for incoming tasks
- `cred_onedrive`: Microsoft OneDrive account (optional if using API-native OneDrive nodes)
- `cred_whatsapp`: WhatsApp Cloud API auth

## Important (V2)

Model credentials are no longer stored in n8n.

- n8n calls OpenClaw hook endpoint with `OPENCLAW_HOOK_TOKEN` from `.env`.
- Model provider credentials are stored only in OpenClaw runtime/profile.

## SMTP / Email Send node

Configure your SMTP credential in Email Send nodes.

