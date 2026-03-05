import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';
import type { OrderWithItems } from '$lib/types';
import { formatPrice, formatDateTime } from '$lib/utils';
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from '$lib/constants';

// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(env.SMTP_PORT || '587'),
    secure: env.SMTP_PORT === '465', // true for 465, false for other ports
    auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
    }
});

const defaultFrom = `"${env.EMAIL_FROM || 'Pizza Mania'}" <${env.SMTP_USER}>`;

// HTML email template wrapper
function getEmailTemplate(title: string, content: string) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #eee; margin-bottom: 20px; }
            .logo { font-size: 24px; font-weight: bold; color: #e53935; text-decoration: none; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #666; }
            .button { display: inline-block; padding: 10px 20px; background-color: #e53935; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
            .order-details { background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .item-row { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 10px; }
            .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; margin-top: 15px; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="logo">Pizza Mania</div>
        </div>
        ${content}
        <div class="footer">
            <p>© ${new Date().getFullYear()} Pizza Mania. All rights reserved.</p>
            <p>Jumet Centre, 6040 Charleroi, Belgium</p>
        </div>
    </body>
    </html>
    `;
}

export async function sendOrderConfirmationEmail(order: OrderWithItems, toEmail: string, originUrl: string) {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
        console.warn('SMTP credentials not found. Skipping order confirmation email.');
        return;
    }

    const itemsHtml = order.order_items.map(item => `
        <div class="item-row">
            <span>${item.quantity}x ${item.item_name}</span>
            <span>${formatPrice(item.item_price * item.quantity)}</span>
        </div>
    `).join('');

    let orderInfo = `<p><strong>Order Type:</strong> ${ORDER_TYPE_LABELS[order.order_type]}</p>`;
    if (order.order_type === 'delivery' && order.delivery_address) {
        orderInfo += `<p><strong>Delivery Address:</strong> ${order.delivery_address}</p>`;
    }
    if (order.scheduled_time) {
        orderInfo += `<p><strong>Scheduled For:</strong> ${new Date(order.scheduled_time).toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</p>`;
    } else {
        orderInfo += `<p><strong>Requested time:</strong> ASAP</p>`;
    }

    const content = `
        <h2>New Order Received! 🍕</h2>
        <p>Hi ${order.customer_name || 'there'},</p>
        <p>Thank you for choosing Pizza Mania! We have received your order <strong>#${order.tracking_token}</strong> and will start preparing it soon.</p>
        
        <div class="order-details">
            <h3>Order Summary</h3>
            ${orderInfo}
            <hr style="border:0;border-top:1px solid #ddd;margin:15px 0;">
            ${itemsHtml}
            <div class="total-row">
                <span>Total</span>
                <span>${formatPrice(order.total)}</span>
            </div>
        </div>

        <div style="text-align: center;">
            <a href="${originUrl}/order/${order.tracking_token}" class="button" style="color: #ffffff;">Track Your Order</a>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: defaultFrom,
            to: toEmail,
            subject: `New Order Received #${order.tracking_token} - Pizza Mania`,
            html: getEmailTemplate('New Order Received', content)
        });
        console.log(`Confirmation email sent to ${toEmail}`);
    } catch (error) {
        console.error('Failed to send confirmation email:', error);
    }
}

export async function sendOrderStatusEmail(order: OrderWithItems, toEmail: string, originUrl: string, previousStatus?: string) {
    if (!env.SMTP_USER || !env.SMTP_PASS) return;

    // Define status order for backward/forward detection
    const statusOrder = ['new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'picked_up', 'served'];

    let isRegression = false;
    if (previousStatus) {
        const prevIdx = statusOrder.indexOf(previousStatus);
        const currIdx = statusOrder.indexOf(order.status);

        if (currIdx !== -1 && prevIdx !== -1 && currIdx <= prevIdx) {
            isRegression = true;
        }
    }

    if (order.status === 'new' && !isRegression) return; // Handled by confirmation email (unless specifically moved back to new)

    const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status;
    let mainMessage = '';
    const regressionNotice = isRegression ? "We've updated your order status to ensure accuracy. " : "";

    switch (order.status) {
        case 'new':
            mainMessage = `${regressionNotice}Your order is back at the initial stage and awaiting confirmation.`;
            break;
        case 'confirmed':
            mainMessage = `${regressionNotice}Your order has been confirmed and is in the queue.`;
            break;
        case 'preparing':
            mainMessage = `${regressionNotice}The kitchen has started preparing your order! It will be fresh and hot soon.`;
            break;
        case 'ready':
            mainMessage = order.order_type === 'pickup'
                ? `${regressionNotice}Your order is ready for pickup! We're waiting for you.`
                : `${regressionNotice}Your order is ready and waiting for the driver.`;
            break;
        case 'out_for_delivery':
            mainMessage = `${regressionNotice}Your order is out for delivery and heading your way!`;
            break;
        case 'delivered':
        case 'picked_up':
        case 'served':
            mainMessage = "Enjoy your meal! Thank you for ordering from Pizza Mania.";
            break;
        case 'cancelled':
            mainMessage = "We're sorry, but your order has been cancelled. Please contact us if you need help.";
            break;
        default:
            mainMessage = `${regressionNotice}Your order status is now: ${statusLabel}`;
    }

    const content = `
        <h2>Order Update #${order.tracking_token}</h2>
        <p>Hi ${order.customer_name || 'there'},</p>
        <p style="font-size: 18px; font-weight: bold; color: #e53935;">${mainMessage}</p>
        
        <div style="text-align: center; margin-top: 30px;">
            <a href="${originUrl}/order/${order.tracking_token}" class="button" style="color: #ffffff;">View Order Details</a>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: defaultFrom,
            to: toEmail,
            subject: `Order Update #${order.tracking_token}: ${statusLabel}`,
            html: getEmailTemplate('Order Update', content)
        });
        console.log(`Status email sent to ${toEmail} (${order.status})`);
    } catch (error) {
        console.error(`Failed to send status to ${toEmail}:`, error);
    }
}

export async function sendNewsletterWelcomeEmail(toEmail: string, originUrl: string) {
    if (!env.SMTP_USER || !env.SMTP_PASS) return;

    const content = `
        <h2>Welcome to the Pizza Mania Family! 🍕</h2>
        <p>Hi there,</p>
        <p>You're successfully subscribed to our newsletter! Get ready for exclusive deals, secret menu items, and the latest news straight from our ovens.</p>
        
        <div style="text-align: center; margin: 30px 0; padding: 20px; background: #fff3e0; border-radius: 8px;">
            <h3 style="color: #e65100; margin-top: 0;">Your First Treat</h3>
            <p>Use code <strong>WELCOME10</strong> on your next order for 10% off!</p>
        </div>

        <div style="text-align: center;">
            <a href="${originUrl}/menu" class="button" style="color: #ffffff;">Order Now</a>
        </div>
        <p style="font-size: 12px; color: #999; margin-top: 40px; text-align: center;">
            You are receiving this because you subscribed to Pizza Mania updates. 
        </p>
    `;

    try {
        await transporter.sendMail({
            from: defaultFrom,
            to: toEmail,
            subject: 'Welcome to Pizza Mania! 🍕 Here is your first treat',
            html: getEmailTemplate('Welcome to Pizza Mania', content)
        });
        console.log(`Newsletter welcome email sent to ${toEmail}`);
    } catch (error) {
        console.error('Failed to send newsletter email:', error);
    }
}

// ─── Admin Notification ────────────────────────────────────────────────

const ADMIN_EMAIL = 'pizzamania.ars@gmail.com';

export async function sendAdminOrderNotificationEmail(order: OrderWithItems, originUrl: string) {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
        console.warn('SMTP credentials not found. Skipping admin notification email.');
        return;
    }

    const orderTypeLabel = ORDER_TYPE_LABELS[order.order_type] || order.order_type;
    const paymentLabel = order.payment_method === 'online' ? '💳 Online (Paid)' : '💵 At Counter';

    const orderInfoRows = [
        `<tr><td style="padding:6px 0;color:#666;width:140px;">Order #</td><td style="padding:6px 0;font-weight:bold;">${order.tracking_token}</td></tr>`,
        `<tr><td style="padding:6px 0;color:#666;">Customer</td><td style="padding:6px 0;">${order.customer_name || '—'}</td></tr>`,
        `<tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;">${order.customer_phone || '—'}</td></tr>`,
        `<tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;">${order.customer_email || '—'}</td></tr>`,
        `<tr><td style="padding:6px 0;color:#666;">Order Type</td><td style="padding:6px 0;">${orderTypeLabel}</td></tr>`,
        `<tr><td style="padding:6px 0;color:#666;">Payment</td><td style="padding:6px 0;">${paymentLabel}</td></tr>`,
        order.delivery_address ? `<tr><td style="padding:6px 0;color:#666;">Address</td><td style="padding:6px 0;">${order.delivery_address}</td></tr>` : '',
        order.scheduled_time
            ? `<tr><td style="padding:6px 0;color:#666;">Scheduled</td><td style="padding:6px 0;">${new Date(order.scheduled_time).toLocaleString('fr-FR', { weekday: 'long', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td></tr>`
            : `<tr><td style="padding:6px 0;color:#666;">Time</td><td style="padding:6px 0;">ASAP</td></tr>`,
        (order as any).special_instructions ? `<tr><td style="padding:6px 0;color:#666;">Notes</td><td style="padding:6px 0;font-style:italic;">${(order as any).special_instructions}</td></tr>` : '',
    ].filter(Boolean).join('');

    const itemsHtml = order.order_items.map(item => `
        <div class="item-row">
            <span>${item.quantity}× ${item.item_name}${item.notes ? ` <em style="color:#888;font-size:12px;">(${item.notes})</em>` : ''}</span>
            <span>${formatPrice(item.item_price * item.quantity)}</span>
        </div>
    `).join('');

    const content = `
        <h2 style="color:#e53935;">🍕 New Order Received!</h2>
        <p>A new order has just been placed. Here are the details:</p>
        <div class="order-details">
            <h3>Customer &amp; Order Info</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">${orderInfoRows}</table>
            <hr style="border:0;border-top:1px solid #ddd;margin:15px 0;">
            <h3>Items Ordered</h3>
            ${itemsHtml}
            <div class="total-row">
                <span>Total</span>
                <span>${formatPrice(order.total)}</span>
            </div>
        </div>
        <div style="text-align: center;">
            <a href="${originUrl}/admin/orders" class="button" style="color: #ffffff;">View in Admin Panel</a>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: defaultFrom,
            to: ADMIN_EMAIL,
            subject: `🍕 Nouvelle commande #${order.tracking_token} — ${orderTypeLabel} — ${formatPrice(order.total)}`,
            html: getEmailTemplate(`New Order #${order.tracking_token}`, content)
        });
        console.log(`Admin notification sent to ${ADMIN_EMAIL} for order ${order.tracking_token}`);
    } catch (error) {
        console.error('Failed to send admin notification email:', error);
    }
}
