# Global accounts and Stripe billing

## 1. Supabase

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. In Authentication settings, enable email/password login and email confirmation.
3. Set `https://girihstudio.com` as the Site URL and add `https://girihstudio.com/app` as an allowed redirect URL.
4. Create your account in the app, then run the final commented SQL statement in `schema.sql` with your email to make that account an admin.

## 2. Stripe

1. Create one product with a recurring Price and copy its `price_...` ID.
2. Enable and configure the Stripe customer portal.
3. Add a webhook endpoint at `https://girihstudio.com/api/stripe-webhook`.
4. Subscribe it to `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.
5. Copy the endpoint signing secret (`whsec_...`).

Use Stripe test mode until sign-up, checkout, cancellation, and failed renewal behavior have all been tested.

## 3. Vercel environment variables

Add every variable from `.env.example` in the Vercel project settings. The `VITE_` variables are intentionally browser-visible. Never prefix the service-role key, Stripe secret key, or webhook secret with `VITE_`.

Redeploy after adding the variables. New users begin with the `free` role. Stripe webhook events grant or remove the `paid` role. The `admin` role is never changed by Stripe.

## 4. Pattern marketplace

1. Run the latest `supabase/schema.sql` again. It creates marketplace listings, purchases, public profile fields, and the idempotent purchase function.
2. In Stripe Dashboard, open **Connect > Get started**, enable Connect, and complete the platform profile. Sellers are created as Stripe Express connected accounts and only request the `transfers` capability because checkout runs as destination charges on the platform.
3. Keep `checkout.session.completed` enabled on the existing webhook. Marketplace ownership is granted only after that signed event is received.
4. Set `MARKETPLACE_FEE_PERCENT` in Vercel. The default is `10`; Stripe processing fees are separate.
5. Redeploy, open `/profile`, complete seller onboarding, and publish a test pattern using Stripe test mode.

The first marketplace version stores the complete model snapshot with each listing, so later changes to the Piece Library do not alter purchased patterns. Preview images are currently stored with listing data; move them to Supabase Storage before allowing large public uploads at scale.
