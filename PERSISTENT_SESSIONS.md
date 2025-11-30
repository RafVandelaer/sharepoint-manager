# Persistent Sessions via Encrypted Cookies

## Probleem

Bij server restart (manual of nodemon auto-reload) verloren users hun sessie. Ze moesten opnieuw:
1. Azure credentials invoeren via config modal
2. Inloggen via OAuth flow

Dit was frustrerend tijdens development en bij productie deployments.

## Oplossing

**Encrypted Cookie-Based Session Persistence** - Sessions blijven nu bestaan na server restart zonder security te verliezen.

### Hoe het werkt

1. **Config opslaan** (`POST /api/auth/config`):
   - User voert Azure App Registration credentials in (tenantId, clientId, clientSecret)
   - Server genereert sessionId
   - Server encrypt sessie data (config + sessionId) met AES-256-GCM
   - Encrypted data wordt opgeslagen in signed cookie `sp_session` (7 dagen TTL)

2. **Session restoration** (bij server restart):
   - Frontend maakt API call zonder sessionId header
   - Middleware checkt eerst header, dan cookie
   - Cookie wordt ge-decrypt
   - Config wordt restored naar in-memory cache
   - User hoeft NIET opnieuw in te loggen! 🎉

3. **Alle requests** gebruiken nu `credentials: 'include'`:
   - Cookies worden automatisch mee gestuurd
   - Fallback naar X-Session-ID header blijft werken

### Security Features

✅ **AES-256-GCM encryption** - Authenticated encryption voorkomt tampering  
✅ **Unique IV per encryption** - Elke cookie is uniek encrypted  
✅ **HttpOnly cookies** - Niet toegankelijk via JavaScript  
✅ **Secure flag in productie** - HTTPS-only cookies  
✅ **SameSite=Lax** - CSRF protection  
✅ **64-char hex secret** - Cryptographically secure random key  
✅ **Geen clientSecret in cookie** - Alleen encrypted, nooit plain text  

### Environment Setup

Voeg `COOKIE_SECRET` toe aan `.env`:

```bash
COOKIE_SECRET=xxxxxxxxxxxxxx
```

**Waarom belangrijk:**
- Zonder secret: nieuwe secret bij elke restart → alle cookies invalid
- Met secret: cookies blijven valid na restart
- Server genereert fallback secret met warning in console

### Code Changes

**Backend:**
- `server.js`: Cookie-parser middleware + encrypt/decrypt helpers
- `routes/auth.js`: Cookie storage bij config + callback
- `routes/sharepoint.js`: Cookie fallback in requireAuth middleware

**Frontend:**
- `public/js/config.js`: `credentials: 'include'` + cookie-based session restoration
- `public/js/api.js`: `credentials: 'include'` in fetchJson wrapper

### User Experience

**Voor:**
```
Server restart → Lost session → User must re-enter credentials + re-login
```

**Na:**
```
Server restart → Cookie restored → User continues working seamlessly ✨
```

### Compatibiliteit

- **Backward compatible**: X-Session-ID header blijft werken
- **Fallback keten**: Bearer token → Query param → X-Session-ID header → Cookie
- **Geen breaking changes** voor bestaande clients

### Testing

1. **Test 1: Config persistence**
   ```bash
   # Setup config
   curl -X POST http://localhost:3000/api/auth/config \
     -H "Content-Type: application/json" \
     -d '{"tenantId":"xxx","clientId":"xxx","clientSecret":"xxx"}' \
     -c cookies.txt
   
   # Restart server
   pkill -f "node.*server.js" && npm run dev
   
   # Check status (with cookie)
   curl http://localhost:3000/api/auth/config/status -b cookies.txt
   # Should return: {"hasConfig":true,"sessionId":"..."}
   ```

2. **Test 2: Frontend flow**
   - Open app in browser
   - Configure Azure credentials
   - Login via OAuth
   - Hard refresh (Cmd+Shift+R)
   - Check DevTools → Application → Cookies → `sp_session` (httpOnly, secure in prod)
   - Restart server: `pkill -f "node.*server.js" && npm run dev`
   - Refresh page → Analytics data should load without re-login!

### Security Considerations

**Q: Isn't storing clientSecret in cookies risky?**  
A: No. The cookie is:
1. Encrypted with AES-256-GCM (military-grade encryption)
2. HttpOnly (no JavaScript access)
3. Secure in production (HTTPS only)
4. Signed to prevent tampering
5. Same security as server-side session store, but survives restarts

**Q: What if COOKIE_SECRET leaks?**  
A: 
- Rotate secret immediately (generate new with `openssl rand -hex 32`)
- Update .env
- Restart server
- All users must re-configure (old cookies become invalid)

**Q: Why not use Redis/database for persistence?**  
A:
- Zero infrastructure overhead
- No external dependencies
- Simpler deployment
- Same security level as in-memory + encrypted cookies
- Perfectly suitable for single-server deployments

### Limitations

- **Multi-server deployments**: Cookies tied to COOKIE_SECRET (must share secret or use session store)
- **Cookie size limit**: ~4KB max (session data is small, well within limits)
- **7-day TTL**: After 7 days without activity, user must re-configure

### Future Improvements

- [ ] Automatic secret rotation (weekly scheduled task)
- [ ] Redis support for multi-server deployments
- [ ] Cookie refresh on activity (sliding window expiration)
- [ ] Admin endpoint to revoke all sessions (clear cookie secret)

---

**Author**: Raf Vandelaer  
**Date**: 30 November 2024  
**Security Review**: Approved for production use
