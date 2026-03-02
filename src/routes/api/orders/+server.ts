import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/supabase/admin';
import { generateTrackingToken } from '$lib/utils';
import type { CreateOrderPayload, OrderWithItems } from '$lib/types';
import { DELIVERY_FEE } from '$lib/constants';
import { sendOrderConfirmationEmail } from '$lib/server/email';

export const POST: RequestHandler = async ({ request, url }) => {
    try {
        const payload: CreateOrderPayload = await request.json();

        // Validate required fields
        if (!payload.items || payload.items.length === 0) {
            return json({ error: 'No items in order' }, { status: 400 });
        }
        if (!payload.order_type) {
            return json({ error: 'Order type is required' }, { status: 400 });
        }

        // Name/phone required for all order types
        if (!payload.customer_name?.trim()) {
            return json({ error: 'Name is required' }, { status: 400 });
        }
        if (!payload.customer_phone?.trim()) {
            return json({ error: 'Phone is required' }, { status: 400 });
        }

        if (payload.order_type === 'delivery' && !payload.delivery_address?.trim()) {
            return json({ error: 'Delivery address is required' }, { status: 400 });
        }

        const supabase = createAdminClient();

        // Calculate totals
        const subtotal = payload.items.reduce(
            (sum, item) => sum + item.item_price * item.quantity,
            0
        );
        const deliveryFee = payload.order_type === 'delivery' ? DELIVERY_FEE : 0;
        const total = subtotal + deliveryFee;

        // Generate tracking token
        const trackingToken = generateTrackingToken();

        // If online payment, create Stripe checkout session BEFORE inserting into DB
        if (payload.payment_method === 'online') {
            try {
                const { stripe } = await import('$lib/stripe.server');
                const appUrl = url.origin;

                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    mode: 'payment',
                    line_items: payload.items.map((item) => ({
                        price_data: {
                            currency: 'eur',
                            product_data: { name: item.item_name },
                            unit_amount: Math.round(item.item_price * 100),
                        },
                        quantity: item.quantity,
                    })),
                    ...(deliveryFee > 0
                        ? {
                            shipping_options: [{
                                shipping_rate_data: {
                                    type: 'fixed_amount' as const,
                                    fixed_amount: { amount: Math.round(deliveryFee * 100), currency: 'eur' },
                                    display_name: 'Delivery Fee',
                                },
                            }],
                        }
                        : {}),
                    success_url: `${appUrl}/order/${trackingToken}?payment=success`,
                    cancel_url: `${appUrl}/checkout?payment=cancelled`,
                    metadata: {
                        tracking_token: trackingToken,
                        // We serialize the entire payload into metadata to reconstruct the order on the webhook
                        payload: JSON.stringify(payload),
                    },
                });

                // Do NOT insert into the database yet. Return the session URL immediately.
                return json({
                    tracking_token: trackingToken,
                    payment_url: session.url,
                });
            } catch (stripeError) {
                console.error('Stripe error:', stripeError);
                return json({ error: 'Payment setup failed' }, { status: 500 });
            }
        }

        // If NOT online, insert order into database
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
                payment_method: payload.payment_method || 'counter',
                payment_status: 'pending',
                special_instructions: payload.special_instructions || null,
                estimated_minutes: payload.order_type === 'delivery' ? 45 : 30,
                scheduled_time: payload.scheduled_time || null,
            })
            .select()
            .single();

        if (orderError) {
            console.error('Order insert error:', orderError);
            return json({ error: 'Failed to create order' }, { status: 500 });
        }

        // Insert order items
        const orderItems = payload.items.map((item) => ({
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
            console.error('Order items insert error:', itemsError);
            await supabase.from('orders').delete().eq('id', order.id);
            return json({ error: 'Failed to create order items' }, { status: 500 });
        }

        // Insert initial status history
        await supabase.from('order_status_history').insert({
            order_id: order.id,
            status: 'new',
            changed_by: null,
        });

        // Send confirmation email
        if (order.customer_email) {
            const fullOrderForEmail: OrderWithItems = { ...order, order_items: orderItems as any };
            sendOrderConfirmationEmail(fullOrderForEmail, order.customer_email, url.origin).catch(console.error);
        }

        return json({
            tracking_token: trackingToken,
            order_id: order.id,
        });
    } catch (error) {
        console.error('Order API error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
