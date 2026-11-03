#!/usr/bin/env bash
# End-to-end smoke test of the demo story against a running server.
# Usage: BASE=http://localhost:3000 bash scripts/smoke.sh
set -euo pipefail
BASE=${BASE:-http://localhost:3000}
J=$(mktemp -d)
as() { curl -s -c "$J/$1" -b "$J/$1" -X POST "$BASE/api/session" -H 'content-type: application/json' -d "{\"persona\":\"$1\"}" >/dev/null; }
post() { curl -s -b "$J/$1" -c "$J/$1" -X POST "$BASE$2" -H 'content-type: application/json' -d "$3"; }
# Status code, or "render-error" when the page came back 200 but rendered an error boundary.
page() { local f="$J/body"; local c; c=$(curl -s -o "$f" -w '%{http_code}' -b "$J/$1" "$BASE$2"); if grep -qE "__next_error__|couldn.t load|Application error" "$f"; then echo render-error; else echo "$c"; fi; }
field() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(!j.ok){console.error('API error:',j.error);process.exit(1)};const v=(new Function('d','return '+process.argv[1]))(j.data);console.log(v)})" "$1"; }
ok() { echo "  ✓ $1"; }
# Status and Location header of a request: "307 /signin?next=…" (Location made relative to BASE).
hop() { curl -s -o /dev/null -D - "$@" | tr -d "\r" | awk -v b="$BASE" 'NR==1{c=$2} tolower($1)=="location:"{l=$2; sub(b,"",l)} END{print c, l}'; }

echo "Signed out"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")" = 200 ] && ok "landing page renders"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/signin")" = 200 ] && ok "sign-in page renders"
loc=$(hop "$BASE/vault?x=1")
[ "$loc" = "307 /signin?next=%2Fvault%3Fx%3D1" ] && ok "app route redirects to /signin?next=… ($loc)"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/state")" = 401 ] && ok "API rejects requests with no persona"
loc=$(hop -X POST -d 'persona=ravi&next=%2Fguardian' "$BASE/api/session")
[ "$loc" = "303 /guardian" ] && ok "sign-in form sets the persona and returns to next"
loc=$(hop -X POST -d 'persona=ravi&next=%2F%2Fevil.example' "$BASE/api/session")
[ "$loc" = "303 /app" ] && ok "off-site next is ignored"
curl -s -D - -o /dev/null -X POST -d 'action=signout' "$BASE/api/session" | grep -qi 'set-cookie: persona=;' && ok "sign out clears the cookie"

for p in meera ravi buyer client agent; do as $p; done
post meera /api/demo '{"action":"reset"}' >/dev/null

echo "Pages"
for path in /app /protect /protect/scan /vault /guardian /subscriptions /shop /get-paid /get-paid/account /support /demo; do
  for p in meera ravi; do c=$(page $p $path); [ "$c" = 200 ] || { echo "  ✗ $path as $p -> $c"; exit 1; }; done
done
[ "$(page agent /console)" = 200 ] && [ "$(page agent /)" = 200 ] && ok "all pages render (200), signed in"

echo "Scam check"
lvl=$(post buyer /api/scam '{"text":"pay me friends and family, my courier agent will pick it up, urgent"}' | field 'd.level')
[ "$lvl" != low ] && ok "F&F + courier agent flagged ($lvl)"

echo "Vault"
id=$(post meera /api/vault '{"action":"create","title":"Canon 200D","amount":320,"currency":"USD"}' | field 'd.deal.id')
post buyer /api/vault "{\"action\":\"authorize\",\"id\":\"$id\"}" | field 'd.status' | grep -q authorized && ok "buyer authorized hold"
post meera /api/vault "{\"action\":\"ship\",\"id\":\"$id\",\"trackingNumber\":\"EZ1\",\"carrier\":\"India Post\"}" >/dev/null
post meera /api/vault "{\"action\":\"deliver\",\"id\":\"$id\"}" >/dev/null
post meera /api/demo '{"action":"advance","hours":73}' | field 'd.jobs.join(",")' | grep -q "released:$id" && ok "auto-released after 72h"
[ "$(page buyer /vault/$id)" = 200 ] && ok "deal page renders"

post meera /api/vault "{\"action\":\"ship\",\"id\":\"$id\",\"trackingNumber\":\"EZ1\",\"carrier\":\"India Post\"}" | grep -q "Can't ship" && ok "can't ship twice"
curl -s -b "$J/meera" "$BASE/vault/$id" | grep -q "Tracking shared with PayPal" && ok "tracking shared with PayPal"

echo "Shopping agent"
post meera /api/shop '{"action":"plan","need":"Monthly reorder: dish soap, rice 5kg, AA batteries, budget USD 40"}' | field 'd.status' | grep -q paid && ok "under the threshold: bought automatically"
cart=$(post meera /api/shop '{"action":"plan","need":"toilet paper, paper towels, laundry detergent, coffee, olive oil"}' | field 'd.status+" "+d.id')
[ "${cart%% *}" = pending_approval ] && ok "above the threshold: waits for one-tap approval"
post meera /api/shop "{\"action\":\"approve\",\"id\":\"${cart#* }\"}" | field 'd.status' | grep -q paid && ok "approved and paid"
post meera /api/shop '{"action":"plan","need":"a 55 inch TV"}' | field 'd.reason' | grep -q "per-order cap" && ok "over the per-order cap: blocked with the reason"
post meera /api/shop '{"action":"revoke","revoked":true}' >/dev/null
post meera /api/shop '{"action":"plan","need":"dish soap"}' | field 'd.reason' | grep -q revoked && ok "revoked agent buys nothing"
post meera /api/shop '{"action":"revoke","revoked":false}' >/dev/null
post meera /api/shop '{"action":"caps","perOrderCap":500,"monthlyCap":100,"autoApproveBelow":10}' | grep -q "monthly cap" && ok "caps panel rejects per-order above monthly"
[ "$(page meera /shop)" = 200 ] && ok "shop page renders"

echo "Guardian"
hid=$(post ravi /api/guardian '{"action":"pay","payee":"Income Tax Officer","amount":450,"note":"pay immediately or arrest"}' | field 'd.hold.id')
post ravi /api/guardian "{\"action\":\"approve\",\"holdId\":\"$hid\"}" | grep -q "Only the guardian" && ok "senior can't self-approve"
post meera /api/guardian "{\"action\":\"block\",\"holdId\":\"$hid\"}" | field 'd.status' | grep -q blocked && ok "guardian blocked the hold"
post ravi /api/guardian '{"action":"pay","payee":"KSEB Electricity","amount":24,"note":"bill"}' | field 'd.status' | grep -q sent && ok "normal bill goes straight through"

echo "Collections"
inv=$(post meera /api/invoices '{"action":"create","clientName":"Dana Brooks","clientEmail":"dana@northwind.demo","relationship":"regular","items":[{"name":"Logo","amount":800}],"currency":"USD","dueInDays":14,"lateFeePercent":2,"offerPayLater":true}' | field 'd.id')
post meera /api/demo '{"action":"advance","hours":384}' | field 'd.jobs.join(",")' | grep -q "$inv:friendly" && ok "friendly reminder after due date"
post client /api/invoices "{\"action\":\"pay\",\"id\":\"$inv\",\"amount\":400}" | field 'd.status' | grep -q partially_paid && ok "client paid half"
[ "$(page client /get-paid/pay/$inv)" = 200 ] && ok "client pay page renders"

echo "FX"
post meera /api/fx '{"price":1000,"clientCurrency":"GBP"}' | field 'd.recommended' | grep -q GBP && ok "recommends client currency"

echo "Freeze"
post meera /api/risk '{"action":"simulate"}' | field 'd.limited' | grep -q true && ok "limitation explained"
[ "$(page meera /get-paid/account)" = 200 ] && ok "explainer page renders"

echo "Support"
cid=$(post ravi /api/support '{"action":"start","text":"My GadgetHub earbuds never arrived"}' | field 'd.id')
post ravi /api/support "{\"action\":\"message\",\"caseId\":\"$cid\",\"text\":\"that didn't work\"}" | field 'd.status' | grep -q waiting_human && ok "escalated, waiting for a human"
aid=$(curl -s -b "$J/agent" "$BASE/console?case=$cid" >/dev/null; post ravi /api/support "{\"action\":\"message\",\"caseId\":\"$cid\",\"text\":\"any update?\"}" | field 'd.actions.find(a=>a.tool==="issue_refund").id')
post ravi /api/support "{\"action\":\"decide\",\"caseId\":\"$cid\",\"actionId\":\"$aid\",\"approve\":true}" | grep -q "Support console only" && ok "customer can't use the console"
post agent /api/support "{\"action\":\"decide\",\"caseId\":\"$cid\",\"actionId\":\"$aid\",\"approve\":true}" | field 'd.status' | grep -q resolved && ok "specialist approved; refund done"
[ "$(page agent "/console?case=$cid")" = 200 ] && ok "console renders"

echo "All smoke checks passed."
