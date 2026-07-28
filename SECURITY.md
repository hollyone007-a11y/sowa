# Security

SOWA stores identity and housing data. Treat every deployment as a confidential
business system.

- Never commit `.env`, the `service_role` key, database passwords, passport
  exports, or production dumps. Only the public `anon` key is ever shipped —
  `public/config.json` is the intended place for it, and it is public on
  purpose: the same value is inside the JavaScript every visitor downloads.
- Row Level Security is the authorization boundary. The interface hides buttons
  for convenience; the database is what actually refuses.
- Passport fields are isolated in `resident_profiles_private`; only `admin` and
  `manager` policies can read it.
- `accountant` reads finance and exports it but cannot read passports.
- `viewer` is read-only and cannot read payments or expenses.
- Use MFA for the Supabase and GitHub administrator accounts.
- Review access quarterly and remove accounts immediately when staff leave.
- Define a retention policy for passport data and delete it when there is no
  longer a legal or business reason to keep it.

## First administrator

The `handle_new_auth_user` trigger promotes the **first** account created in the
project to `admin`; everyone after that starts as `viewer`. Create your own
account immediately after applying the schema, before inviting anyone else, and
confirm in `public.profiles` that no unexpected account holds `admin`.

## The public QR form

`public_property_by_token` and `submit_housing_application` are the only
functions granted to `anon`, and they are the entire anonymous surface. An
application form is a spam target, so it is defended in three places:

- a honeypot field that a person never sees and a bot fills in;
- a 30-day normalized passport duplicate guard across all addresses;
- length and content checks repeated as table constraints.

Automatic admission is disabled by default. If enabled for an address, it only
creates a zero-price tracking stay while capacity remains; a manager must assign
a canonical room/place and confirm the price.

Rotating an address's QR code invalidates every printed copy immediately. Do
that if a code is posted somewhere it should not be.

## Documents and retention

Resident PDF/image attachments live in the private `sowa-documents` Storage
bucket. Only admin and manager may read metadata/files and upload them. Accountant
access remains limited to financial records. Allowed formats are PDF, JPEG, PNG and WEBP up to 15 MB.
Processed QR applications use the per-address retention period and can be purged
by an administrator. Pending applications are never removed automatically.

## Known limitations

- `stays` is readable by every authenticated user, so a `viewer` sees prices and
  paid amounts even though the `payments` ledger itself is restricted. Narrow
  the `stays_read` policy if rent amounts must be hidden from some staff.
- The published GitHub Pages build is public, and the `anon` key travels in it.
  That is by design — the key grants nothing on its own, RLS does the work — but
  it does mean the login page is reachable by anyone.
- There is no self-service password reset in the interface. Reset passwords from
  Supabase → Authentication → Users.

Report security issues privately to the repository owner. Do not open a public
issue containing personal data or credentials.
