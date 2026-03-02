<script lang="ts">
    import { goto } from "$app/navigation";
    import {
        Truck,
        Store,
        UtensilsCrossed,
        CreditCard,
        Banknote,
        Loader2,
    } from "lucide-svelte";
    import { settings } from "$lib/stores/settings";
    import { cart } from "$lib/stores/cart";
    import AddressAutocomplete from "$lib/components/AddressAutocomplete.svelte";
    import { formatPrice, cn } from "$lib/utils";
    import { DELIVERY_FEE } from "$lib/constants";
    import type {
        OrderType,
        PaymentMethod,
        CreateOrderPayload,
    } from "$lib/types";
    import { toast } from "svelte-sonner";

    let cartState = $state(cart.getState());
    let currentItemCount = $state(0);
    let currentSubtotal = $state(0);
    let currentIsDineIn = $state(false);

    cart.subscribe((s) => (cartState = s));
    cart.itemCount.subscribe((v) => (currentItemCount = v));
    cart.subtotal.subscribe((v) => (currentSubtotal = v));
    cart.isDineIn.subscribe((v) => (currentIsDineIn = v));

    let orderType = $derived(cartState.orderType || "delivery");
    let paymentMethod: PaymentMethod = $state(
        orderType === "delivery" ? "online" : "counter",
    );
    let loading = $state(false);
    let isRedirecting = $state(false);

    // Form fields
    let customerName = $state("");
    let customerPhone = $state("");
    let customerEmail = $state("");
    let deliveryAddress = $state(cartState.deliveryAddress || "");
    let specialInstructions = $state("");
    let errors: Record<string, string> = $state({});

    let deliveryFee = $derived(orderType === "delivery" ? DELIVERY_FEE : 0);
    let total = $derived(currentSubtotal + deliveryFee);

    let restrictedOrderType = $derived(
        (() => {
            for (const item of cartState.items) {
                const val = item.selectedOptions["Valid for"];
                if (typeof val === "string") {
                    if (val === "Home Delivery") return "delivery";
                    if (val === "Self Pickup") return "pickup";
                }
            }
            return null;
        })() as OrderType | null,
    );

    $effect(() => {
        if (orderType === "delivery") {
            paymentMethod = "online";
        }
    });

    function validate(): boolean {
        const newErrors: Record<string, string> = {};
        if (!customerName.trim()) newErrors.name = "Name is required";
        if (!customerPhone.trim()) newErrors.phone = "Phone number is required";
        if (orderType === "delivery" && !deliveryAddress.trim())
            newErrors.address = "Delivery address is required";
        errors = newErrors;
        return Object.keys(newErrors).length === 0;
    }

    async function handlePlaceOrder() {
        if (!validate()) return;
        if (currentItemCount === 0) {
            toast.error("Your cart is empty");
            return;
        }

        loading = true;
        try {
            const payload: CreateOrderPayload = {
                order_type: orderType,
                customer_name: customerName.trim(),
                customer_phone: customerPhone.trim(),
                customer_email: customerEmail.trim() || undefined,
                delivery_address:
                    orderType === "delivery"
                        ? deliveryAddress.trim()
                        : undefined,
                table_id: cartState.tableId || undefined,
                payment_method: paymentMethod,
                special_instructions: specialInstructions.trim() || undefined,
                scheduled_time: cartState.scheduledAt || undefined,
                items: cartState.items.map((item) => {
                    const isDeal =
                        item.menuItem.id &&
                        item.menuItem.id.startsWith("deal-");
                    return {
                        menu_item_id: isDeal ? null : item.menuItem.id,
                        deal_id: isDeal
                            ? (item.menuItem as any).deal_id || null
                            : null,
                        item_name: item.menuItem.name,
                        item_price: item.unitPrice,
                        quantity: item.quantity,
                        selected_options: item.selectedOptions,
                        notes: item.notes || undefined,
                    };
                }),
            };

            const res = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to place order");

            if (paymentMethod === "online" && data.payment_url) {
                // Do NOT clear cart here. Wait for successful return from Stripe.
                window.location.href = data.payment_url;
                return;
            }

            isRedirecting = true;
            // Only clear cart here if payment method is NOT online
            cart.clearCart();
            toast.success("Order placed successfully!");
            goto(`/order/${data.tracking_token}`);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Something went wrong",
            );
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        if (currentItemCount === 0 && !isRedirecting) {
            goto("/cart");
        }
    });
</script>

<svelte:head>
    <title>Checkout — {$settings?.restaurant_name || "Pizza Mania"}</title>
</svelte:head>

{#if currentItemCount > 0}
    <div class="checkout-page">
        <div class="checkout-header"><h1>Checkout</h1></div>

        <div class="checkout-layout">
            <div>
                <!-- Order Type -->
                <!-- Order Type (Read Only) -->
                <div class="form-section">
                    <h2>Order Type</h2>
                    <div class={cn("order-type-card active", "read-only")}>
                        {#if orderType === "delivery"}
                            <Truck size={28} color="var(--color-info)" />
                            <h3>Home Delivery</h3>
                            <p>We'll deliver to your door</p>
                        {:else if orderType === "pickup"}
                            <Store size={28} color="var(--color-success)" />
                            <h3>Self Pickup</h3>
                            <p>Pick up at the restaurant</p>
                        {:else}
                            <UtensilsCrossed
                                size={28}
                                color="var(--color-accent)"
                            />
                            <h3>Dine In</h3>
                            <p>Table #{cartState.tableNumber}</p>
                        {/if}
                    </div>
                    <div class="change-order-type">
                        <p>
                            Want to change? <a
                                href="/"
                                onclick={() => cart.clearCart()}>Start over</a
                            >
                        </p>
                    </div>
                </div>

                <!-- Customer Details -->
                <div class="form-section">
                    <h2>Your Details</h2>
                    <div class="form-grid">
                        <div class="field">
                            <label class="label">Name *</label>
                            <input
                                type="text"
                                class="input"
                                placeholder="Your full name"
                                bind:value={customerName}
                            />
                            {#if errors.name}<p class="error-msg">
                                    {errors.name}
                                </p>{/if}
                        </div>
                        <div class="field">
                            <label class="label">Phone *</label>
                            <input
                                type="tel"
                                class="input"
                                placeholder="+32 XXX XX XX XX"
                                bind:value={customerPhone}
                            />
                            {#if errors.phone}<p class="error-msg">
                                    {errors.phone}
                                </p>{/if}
                        </div>
                        <div class="field form-full">
                            <label class="label">Email</label>
                            <input
                                type="email"
                                class="input"
                                placeholder="your@email.com (for order updates)"
                                bind:value={customerEmail}
                            />
                        </div>
                        {#if orderType === "delivery"}
                            <div class="field form-full">
                                <label class="label">Delivery Address *</label>
                                <AddressAutocomplete
                                    bind:value={deliveryAddress}
                                    placeholder="Street address, apartment, city, postal code"
                                />
                                {#if errors.address}<p class="error-msg">
                                        {errors.address}
                                    </p>{/if}
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Payment Method -->
                <div class="form-section">
                    <h2>Payment Method</h2>
                    <div class="payment-options">
                        <div
                            class={cn(
                                "payment-card",
                                paymentMethod === "online" && "active",
                            )}
                            role="button"
                            tabindex="0"
                            onclick={() => (paymentMethod = "online")}
                            onkeydown={(e) =>
                                e.key === "Enter" && (paymentMethod = "online")}
                        >
                            <CreditCard size={24} color="var(--color-info)" />
                            <div>
                                <h4>Pay Online</h4>
                                <p>Secure card payment</p>
                            </div>
                        </div>
                        <div
                            class={cn(
                                "payment-card",
                                paymentMethod === "counter" && "active",
                                orderType === "delivery" && "disabled",
                            )}
                            role="button"
                            tabindex="0"
                            onclick={() =>
                                orderType !== "delivery" &&
                                (paymentMethod = "counter")}
                            onkeydown={(e) =>
                                e.key === "Enter" &&
                                orderType !== "delivery" &&
                                (paymentMethod = "counter")}
                        >
                            <Banknote size={24} color="var(--color-success)" />
                            <div>
                                <h4>
                                    Pay at {orderType === "dine_in"
                                        ? "Table"
                                        : "Counter"}
                                </h4>
                                <p>Cash or card at location</p>
                            </div>
                        </div>
                    </div>
                    {#if orderType === "delivery"}
                        <p
                            style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: var(--space-3);"
                        >
                            Online payment is required for delivery orders
                        </p>
                    {/if}
                </div>

                <!-- Special Instructions -->
                <div class="form-section">
                    <h2>Special Instructions</h2>
                    <textarea
                        class="input"
                        placeholder="Any special requests for the kitchen?"
                        bind:value={specialInstructions}
                        rows="3"
                    ></textarea>
                </div>
            </div>

            <!-- Order Summary -->
            <div class="checkout-summary">
                <h2>Order Summary</h2>
                <div class="summary-items">
                    {#each cartState.items as item (item.id)}
                        <div class="summary-item">
                            <span>{item.quantity}× {item.menuItem.name}</span>
                            <span
                                >{formatPrice(
                                    item.unitPrice * item.quantity,
                                )}</span
                            >
                        </div>
                    {/each}
                </div>
                <div class="summary-row">
                    <span>Subtotal</span>
                    <span>{formatPrice(currentSubtotal)}</span>
                </div>
                {#if orderType === "delivery"}
                    <div class="summary-row">
                        <span>Delivery Fee</span>
                        <span>{formatPrice(deliveryFee)}</span>
                    </div>
                {/if}
                <div class="summary-total">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                </div>
                <button
                    class={cn(
                        "btn btn-primary btn-lg place-order-btn",
                        loading && "loading-btn",
                    )}
                    onclick={handlePlaceOrder}
                    disabled={loading}
                >
                    {#if loading}
                        <Loader2 size={18} class="animate-spin" />
                        Processing...
                    {:else if paymentMethod === "online"}
                        <CreditCard size={18} />
                        Pay {formatPrice(total)}
                    {:else}
                        Place Order — {formatPrice(total)}
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .checkout-page {
        padding: calc(var(--header-height) + var(--space-8)) 0 var(--space-16);
        min-height: 100vh;
        max-width: var(--container-xl);
        margin: 0 auto;
        padding-left: var(--space-6);
        padding-right: var(--space-6);
    }

    .checkout-header {
        margin-bottom: var(--space-8);
    }
    .checkout-header h1 {
        font-family: var(--font-display);
        font-size: var(--text-4xl);
        font-weight: var(--weight-bold);
    }

    .checkout-layout {
        display: grid;
        grid-template-columns: 1fr 380px;
        gap: var(--space-8);
        align-items: start;
    }

    .form-section {
        background: var(--color-bg-glass);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-2xl);
        padding: var(--space-6);
        margin-bottom: var(--space-6);
    }

    .form-section h2 {
        font-size: var(--text-lg);
        font-weight: var(--weight-bold);
        margin-bottom: var(--space-5);
    }

    .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-4);
    }

    .form-full {
        grid-column: 1 / -1;
    }

    .error-msg {
        color: var(--color-danger);
        font-size: var(--text-xs);
        margin-top: var(--space-1);
    }

    .order-type-options {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-3);
    }

    .order-type-card {
        padding: var(--space-5);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-xl);
        text-align: center;
        cursor: pointer;
        transition: all var(--transition-base);
    }

    .order-type-card:hover {
        border-color: var(--color-border-hover);
    }
    .order-type-card.active {
        border-color: var(--color-primary);
        background: rgba(230, 57, 70, 0.08);
    }
    .order-type-card.disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .order-type-card h3 {
        font-size: var(--text-sm);
        font-weight: var(--weight-semibold);
        margin-top: var(--space-2);
    }
    .order-type-card p {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin-top: var(--space-1);
    }

    .payment-options {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-3);
    }

    .payment-card {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-4);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-xl);
        cursor: pointer;
        transition: all var(--transition-base);
    }

    .payment-card:hover {
        border-color: var(--color-border-hover);
    }
    .payment-card.active {
        border-color: var(--color-primary);
        background: rgba(230, 57, 70, 0.08);
    }
    .payment-card.disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .payment-card h4 {
        font-size: var(--text-sm);
        font-weight: var(--weight-semibold);
    }
    .payment-card p {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
    }

    .checkout-summary {
        position: sticky;
        top: calc(var(--header-height) + var(--space-4));
        background: var(--color-bg-glass);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-2xl);
        padding: var(--space-6);
    }

    .checkout-summary h2 {
        font-size: var(--text-lg);
        font-weight: var(--weight-bold);
        margin-bottom: var(--space-5);
    }

    .summary-items {
        border-bottom: 1px solid var(--color-border);
        padding-bottom: var(--space-4);
        margin-bottom: var(--space-3);
    }

    .summary-item {
        display: flex;
        justify-content: space-between;
        padding: var(--space-2) 0;
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
    }

    .summary-row {
        display: flex;
        justify-content: space-between;
        padding: var(--space-2) 0;
        color: var(--color-text-secondary);
        font-size: var(--text-sm);
    }

    .summary-total {
        display: flex;
        justify-content: space-between;
        padding: var(--space-4) 0;
        border-top: 1px solid var(--color-border);
        margin-top: var(--space-2);
        font-size: var(--text-xl);
        font-weight: var(--weight-bold);
    }

    .place-order-btn {
        width: 100%;
        margin-top: var(--space-5);
    }
    .loading-btn {
        opacity: 0.7;
        cursor: wait;
    }

    @media (max-width: 768px) {
        .checkout-header h1 {
            font-size: var(--text-2xl);
        }

        .checkout-layout {
            grid-template-columns: 1fr;
        }

        .order-type-options {
            grid-template-columns: 1fr;
        }

        .form-grid {
            grid-template-columns: 1fr;
        }

        .form-section {
            padding: var(--space-4);
            margin-bottom: var(--space-4);
        }

        .payment-options {
            grid-template-columns: 1fr;
        }

        .checkout-summary {
            position: static;
            border-radius: var(--radius-xl);
            padding: var(--space-4);
        }

        .order-type-card {
            padding: var(--space-4);
        }

        .payment-card {
            min-height: 52px;
        }
    }

    .read-only {
        cursor: default;
        border-color: var(--color-primary);
        background: rgba(230, 57, 70, 0.04);
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: var(--space-4);
        text-align: left;
    }

    .read-only:hover {
        border-color: var(--color-primary);
        background: rgba(230, 57, 70, 0.04);
    }

    .read-only h3 {
        margin-top: 0;
        font-size: var(--text-base);
    }

    .read-only p {
        margin-top: 2px;
    }

    .change-order-type {
        margin-top: var(--space-3);
        text-align: right;
        font-size: var(--text-sm);
        color: var(--color-text-muted);
    }

    .change-order-type a {
        color: var(--color-primary);
        font-weight: var(--weight-medium);
        text-decoration: none;
    }

    .change-order-type a:hover {
        text-decoration: underline;
    }
</style>
