# Ephemeral Admin Token

De applicatie ondersteunt nu een tijdelijk (ephemeral) admin token naast de legacy `ADMIN_API_KEY`.

## Waarom Ephemeral?
- Vermindert risico van langdurige sleutel-compromittering
- Rotatie zonder server restart
- Geen opslag op disk; alleen in-memory
- Expire automatisch (standaard 8 uur)

## Endpoints
```
POST /api/admin/ephemeral
  Headers: X-Admin-Key: <legacy> OF X-Admin-Ephemeral: <bestaand-token>
  Body   : { rotate?: true, ttlMs?: number }
  Return : { token, expiresAt, method }

GET  /api/admin/ephemeral
  Headers: X-Admin-Key: <legacy> OF X-Admin-Ephemeral: <token>
  Return : { status: { hasToken, expiresAt, ttlMs, rotations[] }, method }
```

## Voorbeeld Gebruik
```bash
# Init / rotate (TTL 4 uur) met legacy key
curl -X POST http://localhost:3000/api/admin/ephemeral \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"rotate": true, "ttlMs": 14400000}'

# Status met nieuw ephemeral token
curl http://localhost:3000/api/admin/ephemeral \
  -H "X-Admin-Ephemeral: <token>"
```

## Headers
- `X-Admin-Key` (legacy statische key uit `.env`)
- `X-Admin-Ephemeral` (tijdelijke token uit rotatie endpoint)

Middleware accepteert beide; bij validatie wordt eerst het ephemeral token geprobeerd.

## Rotatiebeleid Aanbeveling
| Situatie | TTL | Actie |
|----------|-----|-------|
| Development | 8h | Dagelijkse rotatie |
| Staging | 4h | Automatische rotatie per shift |
| Productie | 1-4h | Geplande rotatie + monitoring |

## Security Praktijken
- Log nooit volledige token; alleen hash (`sha256`).
- Gebruik separate curl scripts voor rotatie & status.
- Combineer met IP filtering of reverse proxy WAF waar mogelijk.
- Verwijder uiteindelijk `ADMIN_API_KEY` uit `.env` zodra tooling volledig over is.

## Migratie Stappen
1. Genereer ephemeral token via legacy key.
2. Pas admin scripts aan om `X-Admin-Ephemeral` te gebruiken.
3. Monitor rotatie (GET endpoint) tijdens overgang.
4. Verwijder legacy key na succesvolle adoptie.

## Foutmeldingen
- 401: Geen header of ontbrekende credentials.
- 403: Ongeldige key/token (verlopen of mismatch).
- 429: Te veel mislukte pogingen (lockout 15 min).

## Interne Implementatie
`services/adminTokenService.js` bewaart token + expiry in memory.
`middleware/adminAuth.js` valideert eerst ephemeral, dan fallback legacy.

## Toekomstige Verbeteringen
- Rate limiting per endpoint.
- Audit logging van rotaties (met gehashte token).
- Optionele tweede factor (TOTP) voor gevoelige admin endpoints.
