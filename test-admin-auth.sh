#!/bin/bash

# Test script voor /api/logs admin authenticatie
# Gebruik: ./test-admin-auth.sh

ADMIN_KEY="776ff79652791ac1ffbd0ba4dc4d83cbbcd368cb01ea313dd69c6e9cf06dd5ed"
BASE_URL="http://localhost:3000"

echo "🔒 Testing /api/logs admin authentication..."
echo ""

# Test 1: Zonder authenticatie (moet 401 geven)
echo "Test 1: Request zonder authenticatie (verwacht 401):"
curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/api/logs" | head -n 5
echo ""
echo "---"
echo ""

# Test 2: Met verkeerde key (moet 403 geven)
echo "Test 2: Request met verkeerde admin key (verwacht 403):"
curl -s -w "\nHTTP Status: %{http_code}\n" -H "X-Admin-Key: wrong-key-123" "$BASE_URL/api/logs" | head -n 5
echo ""
echo "---"
echo ""

# Test 3: Met correcte key via header (moet 200 geven)
echo "Test 3: Request met correcte admin key via header (verwacht 200):"
curl -s -w "\nHTTP Status: %{http_code}\n" -H "X-Admin-Key: $ADMIN_KEY" "$BASE_URL/api/logs" | head -n 10
echo ""
echo "---"
echo ""

# Test 4: Met correcte key via query parameter (moet 200 geven)
echo "Test 4: Request met correcte admin key via query param (verwacht 200):"
curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/api/logs?adminKey=$ADMIN_KEY" | head -n 10
echo ""
echo "---"
echo ""

echo "✅ Admin authenticatie tests voltooid"
echo ""
echo "📝 Om logs te bekijken in je browser:"
echo "   $BASE_URL/api/logs?adminKey=$ADMIN_KEY"
