import { json, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stripe } from '$lib/stripe.server';
import { createAdminClient } from '$lib/supabase/admin';
import { STRIPE_WEBHOOK_SECRET } from '$env/static/private';

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');

    if (!sig) {
        return json({ error: 'Missing signature' }, { status: 400 });
    }

    try {
        const event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const trackingToken = session.metadata?.tracking_token;
            const payloadStr = session.metadata?.payload;

            if (trackingToken && payloadStr) {
                const supabase = createAdminClient();
                const payload = JSON.parse(payloadStr);

                // Calculate totals
                const subtotal = payload.items.reduce(
                    (sum: number, item: any) => sum + item.item_price * item.quantity,
                    0
                );
                const deliveryFee = payload.order_type === 'delivery' ? 5.99 : 0; // Replace with 5.99 since DELIVERY_FEE isn't imported here, or import it.
                const total = subtotal + deliveryFee;

                // Insert order
                const { data: order, error: orderError } = await supabase
                    .from('orders')
                    .insert({
                        tracking_token: trackingToken,
                        order_type: payload.order_type,
                        status: 'new',
                        customer_name: payload.customer_name || '',
                        customer_phone: payload.customer_phone || '',
                        customer_email: payload.customer_email || null,
                        delivery_address: payload.delivery_address || null,
                        table_id: payload.table_id || null,
                        subtotal,
                        delivery_fee: deliveryFee,
                        total,
                        payment_method: 'online',
                        payment_status: 'paid', // Marked as paid immediately
                        stripe_session_id: session.id,
                        special_instructions: payload.special_instructions || null,
                        estimated_minutes: payload.order_type === 'delivery' ? 45 : 30,
                        scheduled_time: payload.scheduled_time || null,
                    })
                    .select()
                    .single();

                if (orderError) {
                    console.error('Webhook: Order insert error:', orderError);
                } else {
                    // Insert order items
                    const orderItems = payload.items.map((item: any) => ({
                        order_id: order.id,
                        menu_item_id: item.menu_item_id || null,
                        deal_id: (item as any).deal_id || null,
                        item_name: item.item_name,
                        item_price: item.item_price,
                        quantity: item.quantity,
                        selected_options: item.selected_options || {},
                        notes: item.notes || null,
                    }));

                    const { error: itemsError } = await supabase
                        .from('order_items')
                        .insert(orderItems);

                    if (itemsError) {
                        console.error('Webhook: Order items insert error:', itemsError);
                    } else {
                        // Insert initial status history
                        await supabase.from('order_status_history').insert({
                            order_id: order.id,
                            status: 'new',
                            changed_by: null,
                        });

                        console.log(`Order created from webhook with tracking token ${trackingToken}`);

                        // Send emails asynchronously
                        const { sendOrderConfirmationEmail, sendAdminOrderNotificationEmail } = await import('$lib/server/email');
                        const url = new URL(request.url);
                        const fullOrderForEmail = { ...order, order_items: orderItems as any };

                        if (order.customer_email) {
                            sendOrderConfirmationEmail(fullOrderForEmail, order.customer_email, url.origin).catch(console.error);
                        }

                        // Notify admin
                        sendAdminOrderNotificationEmail(fullOrderForEmail, url.origin).catch(console.error);
                    }
                }
            }
        }
        return json({ received: true });
    } catch (err) {
        console.error('Webhook error:', err);
        return json({ error: 'Webhook failed' }, { status: 400 });
    }
};
