const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
    // Stripe sends the event details in the body
    const sig = event.headers['stripe-signature'];
    let stripeEvent;

    try {
        // Verify that the event actually came from Stripe
        stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    // We only care about successful checkouts
    if (stripeEvent.type === 'checkout.session.completed') {
        const session = stripeEvent.data.object;

        // Pull the data we saved in the "metadata" earlier
        const orderItems = session.metadata.order_details; // e.g., "1x altcomics-7"
        const customerEmail = session.customer_details.email;
        const customerName = session.customer_details.name;
        const address = session.shipping_details.address;
        
        const addressString = `${address.line1}, ${address.city}, ${address.state} ${address.postal_code}, ${address.country}`;

        try {
            // 1. Update Inventory in Supabase
            // We parse the metadata string "1x id, 2x id" back into logic
            const items = orderItems.split(', ');
            for (const item of items) {
                const [qtyStr, id] = item.split('x ');
                const qty = parseInt(qtyStr);

                // This SQL command decrements the stock by the quantity sold
                const { error } = await supabase.rpc('decrement_stock', { 
                    row_id: id, 
                    amount: qty 
                });
                if (error) console.error(`Stock update failed for ${id}:`, error);
            }

            // 2. Send Email to YOU (The Merchant)
            await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: 'hallhassi@gmail.com', // Your email
                subject: `New Order: ${customerName}`,
                text: `Items: ${orderItems}\n\nShip to:\n${customerName}\n${addressString}`,
                html: `<p><strong>Items:</strong> ${orderItems}</p><p><strong>Ship to:</strong><br>${customerName}<br>${addressString}</p>`
            });

            // 3. Send Email to CUSTOMER (The Receipt)
            await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: 'hallhassi@gmail.com',
                subject: 'Order Confirmation',
                text: `Thank you for your order. I'll be shipping ${orderItems} to you shortly.`,
                html: `<p>Thank you for your order.</p><p>I'll be shipping <strong>${orderItems}</strong> to you shortly.</p>`
            });

            return { statusCode: 200, body: JSON.stringify({ received: true }) };

        } catch (dbError) {
            console.error('Database or Email error:', dbError);
            return { statusCode: 500, body: 'Internal Server Error' };
        }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
