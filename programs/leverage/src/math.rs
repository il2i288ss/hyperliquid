//! Pure math for the long/short vault. No Solana dependencies, so it can be
//! unit-tested with plain `cargo test` / `rustc --test`.
//!
//! Units
//! - SOL amounts: lamports (u64 / i128 for signed PnL)
//! - price: lamports per 1 raw token unit, scaled by PRICE_SCALE (u128)
//! - USD: whole dollars; SOL/USD as micro-dollars (sol_usd_e6)

pub const PRICE_SCALE: u128 = 1_000_000_000_000; // 1e12
pub const BPS: u128 = 10_000;
pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

/// Max share of free vault capital one coin can use per side (5%).
pub const VAULT_CAP_PER_COIN_BPS: u128 = 500;
/// Max share of free vault capital ALL degen-tier coins can use together (2%).
pub const DEGEN_TOTAL_VAULT_BPS: u128 = 200;
/// A position is liquidated once it has lost 90% of its margin.
pub const LIQ_LOSS_BPS: u128 = 9_000;
/// Liquidator reward: share of the remaining margin.
pub const LIQ_REWARD_BPS: u128 = 1_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Long,
    Short,
}

#[derive(Clone, Copy, Debug)]
pub struct Tier {
    pub id: u8,
    pub min_mcap_usd: u64,
    pub leverage: u8,
    pub max_margin: u64,
    /// fee on position size, charged on open AND on close
    pub fee_bps: u16,
    /// per-coin, per-side cap as share of the coin's pool SOL
    pub oi_cap_bps: u16,
    /// max profit as a multiple of margin
    pub profit_cap_x: u8,
    pub min_hold_secs: u32,
    pub twap_window_secs: u32,
    /// extra unlock rules (degen tier)
    pub min_pool_sol: u64,
    pub min_age_secs: u32,
}

const fn sol(x: u64) -> u64 {
    x * LAMPORTS_PER_SOL
}
const fn half_sol() -> u64 {
    LAMPORTS_PER_SOL / 2
}

/// The tier table agreed for the platform. Index 0 = degen tier.
pub const TIERS: [Tier; 6] = [
    Tier { id: 0, min_mcap_usd: 0,          leverage: 2,  max_margin: half_sol(), fee_bps: 50, oi_cap_bps: 500 , profit_cap_x: 3, min_hold_secs: 180, twap_window_secs: 180, min_pool_sol: sol(20), min_age_secs: 1800 },
    Tier { id: 1, min_mcap_usd: 100_000,    leverage: 3,  max_margin: sol(4),     fee_bps: 50, oi_cap_bps: 500 , profit_cap_x: 5, min_hold_secs: 60,  twap_window_secs: 60,  min_pool_sol: 0,       min_age_secs: 0 },
    Tier { id: 2, min_mcap_usd: 500_000,    leverage: 5,  max_margin: sol(5),     fee_bps: 50, oi_cap_bps: 500 , profit_cap_x: 5, min_hold_secs: 60,  twap_window_secs: 60,  min_pool_sol: 0,       min_age_secs: 0 },
    Tier { id: 3, min_mcap_usd: 1_000_000,  leverage: 10, max_margin: sol(5),     fee_bps: 30, oi_cap_bps: 400 , profit_cap_x: 5, min_hold_secs: 60,  twap_window_secs: 60,  min_pool_sol: 0,       min_age_secs: 0 },
    Tier { id: 4, min_mcap_usd: 5_000_000,  leverage: 10, max_margin: sol(8),     fee_bps: 30, oi_cap_bps: 400 , profit_cap_x: 5, min_hold_secs: 60,  twap_window_secs: 60,  min_pool_sol: 0,       min_age_secs: 0 },
    Tier { id: 5, min_mcap_usd: 10_000_000, leverage: 10, max_margin: sol(10),    fee_bps: 30, oi_cap_bps: 400 , profit_cap_x: 5, min_hold_secs: 60,  twap_window_secs: 60,  min_pool_sol: 0,       min_age_secs: 0 },
];

/// Highest tier whose market-cap threshold the coin meets.
pub fn tier_for_mcap(mcap_usd: u64) -> &'static Tier {
    TIERS.iter().rev().find(|t| mcap_usd >= t.min_mcap_usd).unwrap()
}

/// Market cap in whole USD.
pub fn mcap_usd(price: u128, supply_raw: u64, sol_usd_e6: u64) -> u64 {
    let mcap_lamports = price * supply_raw as u128 / PRICE_SCALE;
    (mcap_lamports * sol_usd_e6 as u128 / LAMPORTS_PER_SOL as u128 / 1_000_000) as u64
}

/// Average price a real trade of `size` lamports would get on a
/// constant-product pool holding `pool_sol` lamports. Used for "virtual
/// price impact": positions pay realistic slippage without moving the pool.
///
/// buying  (open long / close short): p * (R + S) / R
/// selling (open short / close long): p * R / (R + S)
pub fn impact_price(spot: u128, size: u64, pool_sol: u64, buying: bool) -> u128 {
    let r = pool_sol as u128;
    let s = size as u128;
    if buying {
        spot * (r + s) / r
    } else {
        spot * r / (r + s)
    }
}

pub fn entry_price(side: Side, spot: u128, notional: u64, pool_sol: u64) -> u128 {
    impact_price(spot, notional, pool_sol, side == Side::Long)
}

pub fn exit_price(side: Side, spot: u128, entry: u128, notional: u64, pool_sol: u64) -> u128 {
    // value of the position at the current spot price
    let value = (notional as u128 * spot / entry) as u64;
    impact_price(spot, value, pool_sol, side == Side::Short)
}

/// Raw profit or loss in lamports (before fees and caps).
pub fn pnl(side: Side, notional: u64, entry: u128, exit: u128) -> i128 {
    let n = notional as i128;
    let (e, x) = (entry as i128, exit as i128);
    match side {
        Side::Long => n * (x - e) / e,
        Side::Short => n * (e - x) / e,
    }
}

pub fn fee(notional: u64, fee_bps: u16) -> u64 {
    (notional as u128 * fee_bps as u128 / BPS) as u64
}

/// What the trader receives when closing: margin + capped PnL - close fee,
/// never below zero. The vault keeps or pays the difference.
pub fn settle(margin: u64, raw_pnl: i128, profit_cap_x: u8, close_fee: u64) -> u64 {
    let cap = margin as i128 * profit_cap_x as i128;
    let capped = raw_pnl.min(cap);
    let out = margin as i128 + capped - close_fee as i128;
    out.max(0) as u64
}

pub fn is_liquidatable(margin: u64, raw_pnl: i128) -> bool {
    raw_pnl <= -((margin as u128 * LIQ_LOSS_BPS / BPS) as i128)
}

/// Max total open interest (lamports) allowed per side on one coin:
/// the smaller of the pool cap and the vault cap.
pub fn coin_oi_cap(tier: &Tier, pool_sol: u64, vault_free: u64) -> u64 {
    let pool_cap = pool_sol as u128 * tier.oi_cap_bps as u128 / BPS;
    let vault_cap = vault_free as u128 * VAULT_CAP_PER_COIN_BPS / BPS;
    pool_cap.min(vault_cap) as u64
}

pub fn degen_total_cap(vault_free: u64) -> u64 {
    (vault_free as u128 * DEGEN_TOTAL_VAULT_BPS / BPS) as u64
}

/// Time-weighted average price from a ring buffer of (timestamp, price)
/// observations, over the last `window` seconds ending at `now`.
pub fn twap(obs: &[(i64, u128)], now: i64, window: i64) -> Option<u128> {
    let mut v: Vec<(i64, u128)> = obs.iter().copied().filter(|o| o.0 > 0).collect();
    v.sort_by_key(|o| o.0);
    let start = now - window;
    let (mut acc, mut total): (u128, i64) = (0, 0);
    for i in 0..v.len() {
        let seg_start = v[i].0.max(start);
        let seg_end = if i + 1 < v.len() { v[i + 1].0 } else { now };
        let seg_end = seg_end.min(now);
        if seg_end > seg_start {
            acc += v[i].1 * (seg_end - seg_start) as u128;
            total += seg_end - seg_start;
        }
    }
    // Need observations covering at least half the window.
    if total * 2 < window {
        return None;
    }
    Some(acc / total as u128)
}

/// Convert a Q64.64 sqrt price (what Meteora pools store) to our scaled
/// price: (sqrt / 2^64)^2 * PRICE_SCALE. Returns None on overflow.
pub fn price_from_sqrt_q64(sqrt_price: u128) -> Option<u128> {
    let a = sqrt_price >> 32; // sqrt / 2^32
    let sq = a.checked_mul(a)?; // sqrt^2 / 2^64
    // sq / 2^64 * PRICE_SCALE, split to avoid overflow
    let hi = (sq >> 64).checked_mul(PRICE_SCALE)?;
    let lo = ((sq & u64::MAX as u128) * PRICE_SCALE) >> 64;
    hi.checked_add(lo)
}

#[cfg(test)]
mod tests {
    use super::*;

    const P: u128 = PRICE_SCALE; // price "1.0"

    #[test]
    fn sqrt_price_conversion() {
        let one = 1u128 << 64; // sqrt(1.0)
        assert_eq!(price_from_sqrt_q64(one), Some(P));
        let half = 1u128 << 63; // sqrt(0.25)
        assert_eq!(price_from_sqrt_q64(half), Some(P / 4));
    }

    #[test]
    fn tiers_match_spec() {
        assert_eq!(tier_for_mcap(50_000).id, 0);
        assert_eq!(tier_for_mcap(100_000).id, 1);
        assert_eq!(tier_for_mcap(499_999).id, 1);
        assert_eq!(tier_for_mcap(750_000).id, 2);
        assert_eq!(tier_for_mcap(3_000_000).id, 3);
        assert_eq!(tier_for_mcap(7_000_000).id, 4);
        assert_eq!(tier_for_mcap(50_000_000).id, 5);
        let max_pos: Vec<u64> = TIERS.iter().map(|t| t.max_margin * t.leverage as u64 / LAMPORTS_PER_SOL).collect();
        assert_eq!(max_pos, vec![1, 12, 25, 50, 80, 100]);
    }

    #[test]
    fn mcap_conversion() {
        // 1B tokens (6 decimals) at 0.0001 SOL each = 100k SOL... use small:
        // price = 1 lamport per raw unit -> 1e15 lamports = 1e6 SOL, at $150 = $150M
        assert_eq!(mcap_usd(P, 1_000_000_000_000_000, 150_000_000), 150_000_000);
    }

    #[test]
    fn long_and_short_pnl() {
        let n = sol(10);
        assert_eq!(pnl(Side::Long, n, P, P * 12 / 10), sol(2) as i128);
        assert_eq!(pnl(Side::Short, n, P, P * 8 / 10), sol(2) as i128);
        assert_eq!(pnl(Side::Short, n, P, P * 12 / 10), -(sol(2) as i128));
    }

    #[test]
    fn profit_cap_and_floor() {
        // 1 SOL margin, huge win, 5x cap -> max 6 SOL back (minus fee)
        assert_eq!(settle(sol(1), sol(50) as i128, 5, 0), sol(6));
        // total loss never goes negative
        assert_eq!(settle(sol(1), -(sol(3) as i128), 5, 0), 0);
    }

    #[test]
    fn liquidation_at_90pct_loss() {
        assert!(!is_liquidatable(sol(1), -(sol(1) as i128) * 89 / 100));
        assert!(is_liquidatable(sol(1), -(sol(1) as i128) * 90 / 100));
    }

    #[test]
    fn caps_pick_the_smaller_limit() {
        let t = &TIERS[1];
        // 200 SOL pool, 10_000 SOL vault -> pool cap 10 SOL (5%)
        assert_eq!(coin_oi_cap(t, sol(200), sol(10_000)), sol(10));
        // 200 SOL pool, 100 SOL vault -> vault cap 5 SOL
        assert_eq!(coin_oi_cap(t, sol(200), sol(100)), sol(5));
    }

    #[test]
    fn twap_resists_a_last_second_pump() {
        // price 1.0 for 55s, pumped to 1.3 for the final 5s
        let obs = [(1000, P), (1055, P * 13 / 10)];
        let t = twap(&obs, 1060, 60).unwrap();
        assert!(t < P * 103 / 100, "twap moved only ~2.5%: {t}");
        assert!(twap(&[(1059, P)], 1060, 60).is_none(), "too little history");
    }

    /// The manipulation test from the design review: open the full coin cap
    /// long, pump the real pool 30%, close. With virtual price impact the
    /// attacker must lose money in every tier.
    #[test]
    fn pump_attack_is_unprofitable() {
        for (pool, tier) in [(sol(200), &TIERS[1]), (sol(500), &TIERS[2]), (sol(2000), &TIERS[3]), (sol(10_000), &TIERS[5])] {
            let oi = coin_oi_cap(tier, pool, u64::MAX / 2);
            let entry = entry_price(Side::Long, P, oi, pool);
            // real pump of 30%: price x1.3 needs pool SOL x sqrt(1.3)
            let pumped_pool = (pool as f64 * 1.3f64.sqrt()) as u64;
            let pump_buy = pumped_pool - pool;
            let spot = P * 13 / 10;
            let exit = exit_price(Side::Long, spot, entry, oi, pumped_pool);
            let gross = pnl(Side::Long, oi, entry, exit);
            let costs = (fee(oi, tier.fee_bps) * 2) as i128
                + (pump_buy as i128 * 300 / 10_000) * 2; // 3% spot tax in + out
            assert!(gross - costs < 0, "tier {} attack profitable: {}", tier.id, gross - costs);
        }
    }

    #[test]
    fn honest_trader_still_profits_on_real_move() {
        // 25 SOL position on a 500 SOL pool, coin genuinely +40%
        let (pool, n) = (sol(500), sol(25));
        let entry = entry_price(Side::Long, P, n, pool);
        let pool2 = (pool as f64 * 1.4f64.sqrt()) as u64;
        let exit = exit_price(Side::Long, P * 14 / 10, entry, n, pool2);
        let net = pnl(Side::Long, n, entry, exit) - (fee(n, 50) * 2) as i128;
        // raw move is +10 SOL; virtual impact + fees cost a max-size
        // position roughly a third of that, which is the price of safety.
        assert!(net > sol(6) as i128, "net {net}");
    }
}
