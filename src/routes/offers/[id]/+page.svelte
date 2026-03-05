<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import {
        Check,
        ChevronRight,
        ChevronLeft,
        ShoppingBag,
        X,
        Loader2,
        Info,
    } from "lucide-svelte";
    import { fade, fly, scale } from "svelte/transition";
    import { cart } from "$lib/stores/cart";
    import { formatPrice, cn } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import { createClient } from "$lib/supabase/client";
    import { settings } from "$lib/stores/settings";
    import { t } from "$lib/stores/language";

    const supabase = createClient();

    let id = $derived($page.params.id);
    let orderType = $derived($page.url.searchParams.get("type") || "delivery");

    // Data State
    let deal: any = $state(null);
    let loading = $state(true);
    let fetchError: string | null = $state(null);
    let menuItems: any[] = $state([]);

    // Deal Builder State
    let step = $state(0);
    let selections: Record<string, any> = $state({});
    let steps: any[] = $state([]);

    onMount(async () => {
        try {
            loading = true;

            // 1. Fetch Deal
            const { data: dealData, error: dealErr } = await supabase
                .from("deals")
                .select("*")
                .eq("id", id)
                .single();

            if (dealErr || !dealData) throw new Error("Deal not found");

            deal = {
                ...dealData,
                contents: dealData.description
                    ? dealData.description
                          .split(",")
                          .map((s: string) => s.trim())
                    : [],
            };

            // 2. Fetch Menu & Categories
            const [catRes, itemRes] = await Promise.all([
                supabase
                    .from("categories")
                    .select("*")
                    .eq("is_active", true)
                    .order("sort_order"),
                supabase
                    .from("menu_items")
                    .select("*")
                    .eq("is_available", true)
                    .order("sort_order"),
            ]);

            if (catRes.data && itemRes.data) {
                menuItems = itemRes.data.map((item: any) => {
                    const category = catRes.data.find(
                        (c: any) => c.id === item.category_id,
                    );
                    return { ...item, category };
                });
            }

            // 3. Configure Steps
            if (deal.steps && Array.isArray(deal.steps)) {
                steps = deal.steps;
            }
        } catch (e: any) {
            console.error("Error loading deal:", e);
            fetchError = e.message;
        } finally {
            loading = false;
        }
    });

    function getItemsForStep(stepIndex: number) {
        if (!steps[stepIndex]) return [];
        const categoryName = steps[stepIndex].category;
        return menuItems.filter(
            (i) =>
                i.category?.name
                    .toLowerCase()
                    .includes(categoryName.toLowerCase()) ||
                i.category?.name === categoryName,
        );
    }

    function selectItem(stepId: string, item: any) {
        selections[stepId] = item;
        // Auto-advance
        if (step < steps.length - 1) {
            setTimeout(() => {
                if (step < steps.length - 1) step++;
            }, 300);
        }
    }

    function prevStep() {
        if (step > 0) step--;
        else history.back();
    }

    function nextStep() {
        if (step < steps.length - 1) step++;
    }

    function addToCart() {
        if (!deal) return;

        const options: Record<string, string> = {
            "Valable pour":
                orderType === "takeaway"
                    ? $t("checkout.pickup")
                    : $t("checkout.delivery"),
        };

        steps.forEach((s) => {
            if (selections[s.id]) {
                options[s.title] = selections[s.id].name;
            }
        });

        const cartItem = {
            id: `deal-${deal.id}-${Date.now()}`,
            deal_id: deal.id,
            name: deal.title,
            description: deal.contents.join(", "),
            price: deal.price,
            category_id: "deals",
            image_url: deal.image_url,
            is_available: true,
            options: [],
            created_at: new Date().toISOString(),
        };

        // If menuItem ID is needed (based on previous fix)
        // We'll trust the checkout page to handle isDeal: true

        cart.addItem(cartItem, 1, options, $t("deal.bundle_note"));
        toast.success(
            `${deal.title} ${$t("menu.added").replace("{name}", "")}`,
        );
        goto("/cart");
    }

    // Reactivity
    let currentProgress = $derived(
        steps.length > 0 ? ((step + 1) / steps.length) * 100 : 0,
    );
    let isStepComplete = $derived(steps[step] && !!selections[steps[step].id]);
    let isAllComplete = $derived(
        steps.length > 0 && steps.every((s) => selections[s.id]),
    );
</script>

<svelte:head>
    <title
        >{deal ? deal.title : "Loading Deal"} — {$settings?.restaurant_name ||
            "Pizza Mania"}</title
    >
</svelte:head>

<div class="deal-builder-page">
    {#if loading}
        <div class="state-container">
            <Loader2 size={48} class="animate-spin text-accent" />
            <p>{$t("deal.loading")}</p>
        </div>
    {:else if fetchError || !deal}
        <div class="state-container">
            <Info size={48} class="text-danger" />
            <h2>{$t("deal.error_title")}</h2>
            <p>{fetchError || $t("deal.error_desc")}</p>
            <a href="/offers" class="btn btn-primary mt-4"
                >{$t("deal.back_offers")}</a
            >
        </div>
    {:else}
        <div class="builder-container">
            <!-- Left: Info & Progress (Sticky on Desktop) -->
            <aside class="builder-sidebar">
                <div class="deal-info glass">
                    <div class="deal-header">
                        <h1>{deal.title}</h1>
                        <div class="deal-badge">
                            {orderType === "takeaway"
                                ? $t("offers.takeaway_only")
                                : $t("deal.delivery_deal")}
                        </div>
                    </div>

                    <p class="deal-desc">{deal.description}</p>

                    <div class="price-tag">
                        <span class="currency">€</span>
                        <span class="amount">{deal.price.toFixed(2)}</span>
                    </div>

                    <div class="builder-progress">
                        <div class="progress-info">
                            <span
                                >{$t("deal.step")}
                                {step + 1}
                                {$t("deal.of")}
                                {steps.length}</span
                            >
                            <span>{Math.round(currentProgress)}%</span>
                        </div>
                        <div class="progress-track">
                            <div
                                class="progress-bar"
                                style="width: {currentProgress}%"
                            ></div>
                        </div>
                    </div>

                    <div class="selections-summary">
                        <h4>{$t("deal.your_selection")}</h4>
                        <ul class="summary-list">
                            {#each steps as s, i}
                                <li
                                    class:active={i === step}
                                    class:filled={selections[s.id]}
                                >
                                    <div class="summary-dot"></div>
                                    <div class="summary-text">
                                        <div class="summary-step-title">
                                            {s.title}
                                        </div>
                                        <div class="summary-step-value">
                                            {selections[s.id]?.name ||
                                                $t("deal.pending")}
                                        </div>
                                    </div>
                                    {#if selections[s.id]}
                                        <Check size={16} class="text-success" />
                                    {/if}
                                </li>
                            {/each}
                        </ul>
                    </div>

                    <div class="sidebar-actions desktop-only">
                        <button
                            class="btn btn-accent btn-lg full-width"
                            disabled={!isAllComplete}
                            onclick={addToCart}
                        >
                            {$t("deal.complete_order")}
                            <ShoppingBag size={20} />
                        </button>
                        <a href="/offers" class="cancel-link"
                            >{$t("deal.cancel_back")}</a
                        >
                    </div>
                </div>
            </aside>

            <!-- Right: Item Selection -->
            <main class="builder-main">
                <div class="selection-header">
                    <h2>{steps[step]?.title}</h2>
                    <p>{$t("deal.select_one")}</p>
                </div>

                <div class="items-grid">
                    {#each getItemsForStep(step) as item (item.id)}
                        <button
                            class="item-card glass {selections[steps[step].id]
                                ?.id === item.id
                                ? 'selected'
                                : ''}"
                            onclick={() => selectItem(steps[step].id, item)}
                        >
                            {#if item.image_url}
                                <img
                                    src={item.image_url}
                                    alt={item.name}
                                    class="item-img"
                                />
                            {:else}
                                <div class="item-img-placeholder">
                                    <ShoppingBag size={32} />
                                </div>
                            {/if}

                            <div class="item-info">
                                <div class="item-name">{item.name}</div>
                                {#if item.description}
                                    <p class="item-desc">{item.description}</p>
                                {/if}
                            </div>

                            {#if selections[steps[step].id]?.id === item.id}
                                <div class="selected-badge" transition:scale>
                                    <Check size={18} />
                                </div>
                            {/if}
                        </button>
                    {/each}
                </div>

                <!-- Footer Navigation (Mobile) -->
                <div class="builder-footer mobile-only">
                    <div class="footer-inner glass">
                        <button class="nav-btn prev" onclick={prevStep}>
                            <ChevronLeft size={24} />
                        </button>

                        <div class="footer-info">
                            <div class="footer-price">
                                €{deal.price.toFixed(2)}
                            </div>
                            <div class="footer-step">
                                Step {step + 1}/{steps.length}
                            </div>
                        </div>

                        {#if step < steps.length - 1}
                            <button
                                class="nav-btn next"
                                onclick={nextStep}
                                disabled={!isStepComplete}
                            >
                                <ChevronRight size={24} />
                            </button>
                        {:else}
                            <button
                                class="btn btn-accent btn-sm"
                                onclick={addToCart}
                                disabled={!isAllComplete}
                            >
                                <ShoppingBag size={18} />
                            </button>
                        {/if}
                    </div>
                </div>

                <!-- Desktop Bottom Nav if needed, but sidebar has it -->
                <div class="desktop-nav-footer desktop-only">
                    {#if step > 0}
                        <button class="btn btn-outline" onclick={prevStep}>
                            <ChevronLeft size={18} />
                            {$t("deal.prev_step")}
                        </button>
                    {:else}
                        <div></div>
                    {/if}

                    {#if step < steps.length - 1}
                        <button
                            class="btn btn-primary"
                            onclick={nextStep}
                            disabled={!isStepComplete}
                        >
                            {$t("deal.next_step")}
                            <ChevronRight size={18} />
                        </button>
                    {/if}
                </div>
            </main>
        </div>
    {/if}
</div>

<style>
    .deal-builder-page {
        min-height: 100vh;
        background: var(--color-bg-primary);
        padding-top: var(--header-height);
        display: flex;
        flex-direction: column;
    }

    .state-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: var(--space-4);
        padding: var(--space-10);
    }

    .builder-container {
        display: flex;
        flex-direction: column;
        max-width: var(--container-xl);
        margin: 0 auto;
        padding: var(--space-6);
        gap: var(--space-8);
        width: 100%;
    }

    /* Sidebar */
    .builder-sidebar {
        width: 100%;
    }

    .deal-info {
        padding: var(--space-6);
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-2xl);
    }

    .deal-header h1 {
        font-family: var(--font-display);
        font-size: var(--text-2xl);
        font-weight: var(--weight-bold);
        margin-bottom: var(--space-1);
    }

    .deal-badge {
        display: inline-block;
        font-size: var(--text-xs);
        font-weight: var(--weight-bold);
        background: rgba(230, 57, 70, 0.1);
        color: var(--color-primary);
        padding: 4px 12px;
        border-radius: var(--radius-full);
        text-transform: uppercase;
    }

    .deal-desc {
        color: var(--color-text-secondary);
        font-size: var(--text-sm);
        line-height: var(--leading-relaxed);
    }

    .price-tag {
        display: flex;
        align-items: baseline;
        gap: 4px;
        color: var(--color-accent);
    }

    .price-tag .currency {
        font-size: var(--text-xl);
        font-weight: var(--weight-bold);
    }
    .price-tag .amount {
        font-size: 3rem;
        font-weight: var(--weight-black);
        line-height: 1;
    }

    .builder-progress {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }

    .progress-info {
        display: flex;
        justify-content: space-between;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        font-weight: var(--weight-bold);
    }

    .progress-track {
        height: 6px;
        background: var(--color-bg-tertiary);
        border-radius: var(--radius-full);
        overflow: hidden;
    }

    .progress-bar {
        height: 100%;
        background: var(--color-primary);
        transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .selections-summary h4 {
        font-size: var(--text-sm);
        font-weight: var(--weight-bold);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: var(--space-4);
        color: var(--color-text-muted);
    }

    .summary-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }

    .summary-list li {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3);
        border-radius: var(--radius-lg);
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid transparent;
        transition: all 0.2s;
    }

    .summary-list li.active {
        background: rgba(255, 255, 255, 0.05);
        border-color: var(--color-border);
    }

    .summary-list li.filled {
        background: rgba(42, 157, 143, 0.05);
    }

    .summary-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-border);
    }

    .active .summary-dot {
        background: var(--color-primary);
        box-shadow: 0 0 10px var(--color-primary);
    }
    .filled .summary-dot {
        background: var(--color-success);
    }

    .summary-text {
        flex: 1;
    }
    .summary-step-title {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
    }
    .summary-step-value {
        font-size: var(--text-sm);
        font-weight: var(--weight-semibold);
    }

    .cancel-link {
        display: block;
        text-align: center;
        margin-top: var(--space-4);
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        text-decoration: underline;
    }

    /* Main Area */
    .builder-main {
        flex: 1;
        width: 100%;
    }

    .selection-header {
        margin-bottom: var(--space-6);
    }

    .selection-header h2 {
        font-family: var(--font-display);
        font-size: var(--text-3xl);
        font-weight: var(--weight-bold);
        margin-bottom: var(--space-1);
    }

    .selection-header p {
        color: var(--color-text-secondary);
    }

    .items-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: var(--space-4);
        padding-bottom: 120px; /* Space for mobile footer */
    }

    .item-card {
        display: flex;
        flex-direction: column;
        text-align: left;
        border-radius: var(--radius-xl);
        border: 1px solid var(--color-border);
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        position: relative;
    }

    .item-card:hover {
        border-color: var(--color-border-hover);
        transform: translateY(-4px);
    }

    .item-card.selected {
        border-color: var(--color-primary);
        background: rgba(230, 57, 70, 0.05);
        box-shadow: 0 0 0 1px var(--color-primary);
    }

    .item-img {
        width: 100%;
        aspect-ratio: 16/10;
        object-fit: contain;
        background: rgba(255, 255, 255, 0.02);
    }

    .item-img-placeholder {
        width: 100%;
        aspect-ratio: 16/10;
        background: var(--color-bg-tertiary);
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.1);
    }

    .item-info {
        padding: var(--space-4);
    }

    .item-name {
        font-weight: var(--weight-bold);
        font-size: var(--text-sm);
        margin-bottom: 2px;
    }

    .item-desc {
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .selected-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        background: var(--color-primary);
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--shadow-md);
    }

    /* Mobile Footer */
    .builder-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        padding: var(--space-4);
        z-index: var(--z-sticky);
    }

    .footer-inner {
        max-width: 500px;
        margin: 0 auto;
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-full);
        border: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(15, 15, 26, 0.8) !important;
        backdrop-filter: blur(20px) !important;
        box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5);
    }

    .nav-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-primary);
        background: var(--color-bg-tertiary);
        transition: all 0.2s;
    }

    .nav-btn:disabled {
        opacity: 0.3;
    }

    .footer-info {
        text-align: center;
    }
    .footer-price {
        font-weight: var(--weight-black);
        font-size: var(--text-lg);
        color: var(--color-accent);
    }
    .footer-step {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        text-transform: uppercase;
    }

    .desktop-nav-footer {
        margin-top: var(--space-8);
        padding-top: var(--space-8);
        border-top: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
    }

    .full-width {
        width: 100%;
        border-radius: var(--radius-xl);
    }

    .desktop-only {
        display: none;
    }

    @media (min-width: 1024px) {
        .mobile-only {
            display: none;
        }
        .desktop-only {
            display: flex;
        }

        .builder-container {
            flex-direction: row;
            align-items: flex-start;
        }

        .builder-sidebar {
            width: 340px;
            position: sticky;
            top: calc(var(--header-height) + var(--space-6));
        }

        .items-grid {
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            padding-bottom: 0;
        }

        .item-name {
            font-size: var(--text-base);
        }
    }
</style>
