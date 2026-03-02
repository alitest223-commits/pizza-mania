<script lang="ts">
    import { Search, Loader2 } from 'lucide-svelte';
    import { goto } from '$app/navigation';
    import { settings } from '$lib/stores/settings';

    let token = $state('');
    let loading = $state(false);
    let error = $state('');

    function handleTrack(e: SubmitEvent) {
        e.preventDefault();
        if (!token.trim()) return;
        
        loading = true;
        error = '';
        
        // Tracking tokens are typically 8-10 chars like PM-XXXXXX
        // But we just navigate and let the [token] page handle the lookup
        goto(`/order/${token.trim().toUpperCase()}`);
    }
</script>

<svelte:head>
    <title>Track Your Order — {$settings?.restaurant_name || 'Pizza Mania'}</title>
</svelte:head>

<div class="track-lookup-page">
    <div class="track-card glass">
        <div class="track-header">
            <div class="track-icon">
                <Search size={32} />
            </div>
            <h1>Track Your Order</h1>
            <p>Enter your tracking token to see your order status</p>
        </div>

        <form onsubmit={handleTrack} class="track-form">
            <div class="input-group">
                <input 
                    type="text" 
                    bind:value={token} 
                    placeholder="e.g. ORD-AB12CD" 
                    required
                    class="track-input"
                />
            </div>
            
            {#if error}
                <p class="error-text">{error}</p>
            {/if}

            <button type="submit" class="btn btn-primary" disabled={loading || !token.trim()}>
                {#if loading}
                    <Loader2 size={18} class="animate-spin" />
                    <span>Searching...</span>
                {:else}
                    <span>Track Order</span>
                {/if}
            </button>
        </form>

        <div class="track-help">
            <p>Can't find your token? Check your confirmation email or SMS.</p>
        </div>
    </div>
</div>

<style>
    .track-lookup-page {
        padding: calc(var(--header-height) + var(--space-20)) var(--space-6) var(--space-20);
        min-height: 80vh;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .track-card {
        width: 100%;
        max-width: 480px;
        padding: var(--space-10);
        text-align: center;
        animation: fadeInUp 0.5s ease-out;
    }

    .track-header {
        margin-bottom: var(--space-8);
    }

    .track-icon {
        width: 64px;
        height: 64px;
        background: rgba(230, 57, 70, 0.1);
        color: var(--color-primary);
        border-radius: var(--radius-2xl);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto var(--space-4);
    }

    .track-header h1 {
        font-family: var(--font-display);
        font-size: var(--text-3xl);
        font-weight: var(--weight-bold);
        margin-bottom: var(--space-2);
    }

    .track-header p {
        color: var(--color-text-secondary);
    }

    .track-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
    }

    .track-input {
        width: 100%;
        padding: var(--space-4) var(--space-6);
        background: var(--color-bg-tertiary);
        border: 2px solid var(--color-border);
        border-radius: var(--radius-xl);
        color: var(--color-text-primary);
        font-size: var(--text-lg);
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        transition: all var(--transition-base);
    }

    .track-input:focus {
        border-color: var(--color-primary);
        outline: none;
        background: var(--color-bg-secondary);
        box-shadow: 0 0 0 4px rgba(230, 57, 70, 0.1);
    }

    .btn {
        width: 100%;
        padding: var(--space-4);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        font-weight: var(--weight-bold);
    }

    .track-help {
        margin-top: var(--space-8);
        padding-top: var(--space-6);
        border-top: 1px solid var(--color-border);
    }

    .track-help p {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
    }

    .error-text {
        color: var(--color-danger);
        font-size: var(--text-sm);
        margin-bottom: var(--space-2);
    }
</style>
