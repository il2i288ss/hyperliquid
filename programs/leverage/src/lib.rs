//! Long/short vault program.
//!
//! - Positions are SYNTHETIC: opening or closing never buys or sells the coin,
//!   so winners don't dump the chart. Wins are paid in SOL from the vault.
//! - The vault is a program-owned PDA. There is NO withdraw instruction:
//!   SOL leaves the vault only as payouts to closing/liquidated positions.
//! - Prices come from a TWAP of the coin's Meteora pool, and every open/close
//!   pays virtual price impact as if it had traded on that pool.
//!
//! Lines marked VERIFY depend on Meteora account layouts; check them against
//! the DBC / DAMM v2 IDLs before deploying.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

pub mod math;
use math::*;

declare_id!("11111111111111111111111111111111"); // replace after `anchor keys sync`

const OBS: usize = 16;

#[program]
pub mod leverage {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, sol_usd_e6: u64) -> Result<()> {
        let g = &mut ctx.accounts.global;
        g.admin = ctx.accounts.admin.key(); // use a Squads multisig
        g.keeper = ctx.accounts.admin.key();
        g.sol_usd_e6 = sol_usd_e6;
        g.paused = false;
        g.bump = ctx.bumps.global;
        ctx.accounts.vault.bump = ctx.bumps.vault;
        Ok(())
    }

    /// Admin can pause NEW positions and update the SOL/USD rate used for
    /// tier thresholds. Admin can never move vault funds.
    pub fn set_params(ctx: Context<AdminOnly>, sol_usd_e6: u64, paused: bool, keeper: Pubkey) -> Result<()> {
        let g = &mut ctx.accounts.global;
        g.sol_usd_e6 = sol_usd_e6;
        g.paused = paused;
        g.keeper = keeper;
        Ok(())
    }

    pub fn create_market(ctx: Context<CreateMarket>, pool_kind: u8, launched_at: i64) -> Result<()> {
        require!(pool_kind <= 1, ErrorCode::BadPool);
        let m = &mut ctx.accounts.market;
        m.mint = ctx.accounts.mint.key();
        m.pool = ctx.accounts.pool.key();
        m.pool_kind = pool_kind;
        m.supply = ctx.accounts.mint.supply;
        m.launched_at = launched_at;
        m.enabled = true;
        m.bump = ctx.bumps.market;
        Ok(())
    }

    /// Keeper flags: enable/disable leverage on a coin, e.g. when the top 10
    /// holders own too much (insider dump protection), or after graduation
    /// to point at the new DAMM v2 pool.
    pub fn set_market(ctx: Context<KeeperMarket>, enabled: bool, pool_kind: u8) -> Result<()> {
        let m = &mut ctx.accounts.market;
        m.enabled = enabled;
        if m.pool != ctx.accounts.pool.key() {
            m.pool = ctx.accounts.pool.key();
            m.pool_kind = pool_kind;
            m.obs = [Obs::default(); OBS]; // new pool -> fresh price history
        }
        Ok(())
    }

    /// Permissionless: read the pool and record a price observation.
    /// A keeper calls this every few seconds per active coin.
    pub fn update_price(ctx: Context<UpdatePrice>) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require_keys_eq!(ctx.accounts.pool.key(), m.pool, ErrorCode::BadPool);
        let (price, pool_sol) = read_pool(m.pool_kind, &ctx.accounts.pool.try_borrow_data()?)?;
        let now = Clock::get()?.unix_timestamp;
        let i = m.obs_idx as usize % OBS;
        m.obs[i] = Obs { ts: now, price };
        m.obs_idx = m.obs_idx.wrapping_add(1);
        m.pool_sol = pool_sol;
        Ok(())
    }

    pub fn open_position(ctx: Context<OpenPosition>, nonce: u64, long: bool, margin: u64, leverage: u8) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        // Read-only checks first (no mutable borrows yet).
        let free = {
            let ai = ctx.accounts.vault.to_account_info();
            ctx.accounts.vault.free_capital(&ai)?
        };
        let g = &ctx.accounts.global;
        let m = &ctx.accounts.market;
        require!(!g.paused, ErrorCode::Paused);
        require!(m.enabled, ErrorCode::MarketDisabled);

        // Tier is picked from the 3-minute TWAP market cap, so a quick pump
        // can't unlock a higher tier. VERIFY tuning before mainnet.
        let tier_price = m.twap(now, TIERS[0].twap_window_secs as i64)?;
        let tier = tier_for_mcap(mcap_usd(tier_price, m.supply, g.sol_usd_e6));
        if tier.id == 0 {
            require!(m.pool_sol >= tier.min_pool_sol, ErrorCode::TierLocked);
            require!(now - m.launched_at >= tier.min_age_secs as i64, ErrorCode::TierLocked);
        }
        require!(leverage >= 1 && leverage <= tier.leverage, ErrorCode::TooMuchLeverage);
        require!(margin > 0 && margin <= tier.max_margin, ErrorCode::MarginTooBig);

        let notional = margin * leverage as u64;
        let cap = coin_oi_cap(tier, m.pool_sol, free);
        let side_oi = if long { m.oi_long } else { m.oi_short };
        require!(side_oi + notional <= cap, ErrorCode::CapReached);
        if tier.id == 0 {
            require!(ctx.accounts.vault.degen_oi + notional <= degen_total_cap(free), ErrorCode::CapReached);
        }

        let spot = m.twap(now, tier.twap_window_secs as i64)?;
        let side = if long { Side::Long } else { Side::Short };
        let entry = entry_price(side, spot, notional, m.pool_sol);
        let open_fee = fee(notional, tier.fee_bps);

        // Trader sends margin + fee into the vault. The fee stays there.
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            margin + open_fee,
        )?;

        let m = &mut ctx.accounts.market;
        if long { m.oi_long += notional } else { m.oi_short += notional }
        let market_key = m.key();
        let v = &mut ctx.accounts.vault;
        v.locked_margin += margin;
        if tier.id == 0 { v.degen_oi += notional }

        let p = &mut ctx.accounts.position;
        p.owner = ctx.accounts.owner.key();
        p.market = market_key;
        p.nonce = nonce;
        p.long = long;
        p.margin = margin;
        p.notional = notional;
        p.entry_price = entry;
        p.opened_at = now;
        p.tier = tier.id;
        p.bump = ctx.bumps.position;
        emit!(PositionOpened { owner: p.owner, market: p.market, long, margin, notional, entry_price: entry });
        Ok(())
    }

    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let p = &ctx.accounts.position;
        let tier = &TIERS[p.tier as usize];
        require!(now - p.opened_at >= tier.min_hold_secs as i64, ErrorCode::HoldTime);
        let (raw, _) = position_pnl(&ctx.accounts.market, p, now)?;
        let payout = settle(p.margin, raw, tier.profit_cap_x, fee(p.notional, tier.fee_bps));
        let owner = ctx.accounts.owner.to_account_info();
        finish(&mut ctx.accounts.market, &mut ctx.accounts.vault, p, &owner, payout)?;
        emit!(PositionClosed { owner: p.owner, market: p.market, pnl: raw as i64, payout, liquidated: false });
        Ok(())
    }

    /// Permissionless: anyone can liquidate a position that lost 90% of its
    /// margin and earns 10% of whatever margin is left.
    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let p = &ctx.accounts.position;
        let (raw, _) = position_pnl(&ctx.accounts.market, p, now)?;
        require!(is_liquidatable(p.margin, raw), ErrorCode::NotLiquidatable);
        let left = (p.margin as i128 + raw).max(0) as u64;
        let reward = (left as u128 * LIQ_REWARD_BPS / BPS) as u64;
        let liq = ctx.accounts.liquidator.to_account_info();
        finish(&mut ctx.accounts.market, &mut ctx.accounts.vault, p, &liq, reward)?;
        emit!(PositionClosed { owner: p.owner, market: p.market, pnl: raw as i64, payout: 0, liquidated: true });
        Ok(())
    }
}

// ---------- helpers ----------

fn position_pnl(m: &Market, p: &Position, now: i64) -> Result<(i128, u128)> {
    let tier = &TIERS[p.tier as usize];
    let spot = m.twap(now, tier.twap_window_secs as i64)?;
    let side = if p.long { Side::Long } else { Side::Short };
    let exit = exit_price(side, spot, p.entry_price, p.notional, m.pool_sol);
    Ok((pnl(side, p.notional, p.entry_price, exit), exit))
}

/// Release the position from the books and pay `payout` lamports from the
/// vault to `to`. This is the ONLY place lamports leave the vault.
fn finish<'info>(m: &mut Market, v: &mut Account<'info, Vault>, p: &Position, to: &AccountInfo<'info>, payout: u64) -> Result<()> {
    if p.long { m.oi_long -= p.notional } else { m.oi_short -= p.notional }
    if p.tier == 0 { v.degen_oi = v.degen_oi.saturating_sub(p.notional) }
    v.locked_margin -= p.margin;
    if payout > 0 {
        let vault_ai = v.to_account_info();
        let rent = Rent::get()?.minimum_balance(vault_ai.data_len());
        require!(vault_ai.lamports() >= payout + rent, ErrorCode::VaultEmpty);
        **vault_ai.try_borrow_mut_lamports()? -= payout;
        **to.try_borrow_mut_lamports()? += payout;
    }
    Ok(())
}

/// Parse price + SOL liquidity from a Meteora pool account.
/// VERIFY: byte offsets against the DBC VirtualPool (kind 0) and DAMM v2
/// Pool (kind 1) layouts in the IDLs. They are placeholders until checked.
fn read_pool(kind: u8, data: &[u8]) -> Result<(u128, u64)> {
    let (sqrt_off, sol_off) = match kind {
        0 => (DBC_SQRT_PRICE_OFFSET, DBC_QUOTE_RESERVE_OFFSET),
        1 => (DAMM_SQRT_PRICE_OFFSET, DAMM_TOKEN_B_OFFSET),
        _ => return err!(ErrorCode::BadPool),
    };
    require!(sqrt_off > 0 && data.len() >= sol_off + 8, ErrorCode::PoolLayoutNotSet);
    let sqrt = u128::from_le_bytes(data[sqrt_off..sqrt_off + 16].try_into().unwrap());
    let sol = u64::from_le_bytes(data[sol_off..sol_off + 8].try_into().unwrap());
    let price = price_from_sqrt_q64(sqrt).ok_or(ErrorCode::MathOverflow)?;
    Ok((price, sol))
}
// Fill these from the Meteora IDLs (8-byte discriminator included). VERIFY
const DBC_SQRT_PRICE_OFFSET: usize = 0;
const DBC_QUOTE_RESERVE_OFFSET: usize = 0;
const DAMM_SQRT_PRICE_OFFSET: usize = 0;
const DAMM_TOKEN_B_OFFSET: usize = 0;

// ---------- accounts ----------

#[account]
#[derive(InitSpace)]
pub struct Global {
    pub admin: Pubkey,
    pub keeper: Pubkey,
    pub sol_usd_e6: u64,
    pub paused: bool,
    pub bump: u8,
}

/// The long/short vault. Its lamports ARE the vault balance. Anyone can send
/// SOL to it (fee splitter, trader margins); only `finish` pays out.
#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub locked_margin: u64,
    pub degen_oi: u64,
    pub bump: u8,
}

impl Vault {
    /// Capital available to back positions: balance - rent - traders' margin.
    pub fn free_capital(&self, ai: &AccountInfo) -> Result<u64> {
        let rent = Rent::get()?.minimum_balance(ai.data_len());
        Ok(ai.lamports().saturating_sub(rent).saturating_sub(self.locked_margin))
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct Obs {
    pub ts: i64,
    pub price: u128,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub mint: Pubkey,
    pub pool: Pubkey,
    pub pool_kind: u8, // 0 = DBC curve, 1 = DAMM v2 after graduation
    pub supply: u64,
    pub launched_at: i64,
    pub enabled: bool,
    pub pool_sol: u64,
    pub oi_long: u64,
    pub oi_short: u64,
    pub obs: [Obs; 16], // = OBS (literal for InitSpace)
    pub obs_idx: u16,
    pub bump: u8,
}

impl Market {
    pub fn twap(&self, now: i64, window: i64) -> Result<u128> {
        let obs: Vec<(i64, u128)> = self.obs.iter().map(|o| (o.ts, o.price)).collect();
        twap(&obs, now, window).ok_or_else(|| error!(ErrorCode::StalePrice))
    }
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub nonce: u64,
    pub long: bool,
    pub margin: u64,
    pub notional: u64,
    pub entry_price: u128,
    pub opened_at: i64,
    pub tier: u8,
    pub bump: u8,
}

// ---------- contexts ----------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Global::INIT_SPACE, seeds = [b"global"], bump)]
    pub global: Account<'info, Global>,
    #[account(init, payer = admin, space = 8 + Vault::INIT_SPACE, seeds = [b"vault"], bump)]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"global"], bump = global.bump, has_one = admin)]
    pub global: Account<'info, Global>,
}

#[derive(Accounts)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(seeds = [b"global"], bump = global.bump, constraint = global.keeper == keeper.key() || global.admin == keeper.key() @ ErrorCode::Unauthorized)]
    pub global: Account<'info, Global>,
    pub mint: Account<'info, anchor_spl::token::Mint>,
    /// CHECK: Meteora pool account, parsed in read_pool
    pub pool: UncheckedAccount<'info>,
    #[account(init, payer = keeper, space = 8 + Market::INIT_SPACE, seeds = [b"market", mint.key().as_ref()], bump)]
    pub market: Account<'info, Market>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct KeeperMarket<'info> {
    pub keeper: Signer<'info>,
    #[account(seeds = [b"global"], bump = global.bump, constraint = global.keeper == keeper.key() || global.admin == keeper.key() @ ErrorCode::Unauthorized)]
    pub global: Account<'info, Global>,
    #[account(mut, seeds = [b"market", market.mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    /// CHECK: new or current pool
    pub pool: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(mut, seeds = [b"market", market.mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    /// CHECK: must equal market.pool (checked in handler)
    pub pool: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"global"], bump = global.bump)]
    pub global: Account<'info, Global>,
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, seeds = [b"market", market.mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(init, payer = owner, space = 8 + Position::INIT_SPACE,
        seeds = [b"pos", market.key().as_ref(), owner.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub position: Account<'info, Position>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, seeds = [b"market", market.mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(mut, close = owner, has_one = owner, has_one = market)]
    pub position: Account<'info, Position>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,
    /// CHECK: receives the position account's rent back
    #[account(mut, address = position.owner)]
    pub owner: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, seeds = [b"market", market.mint.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(mut, close = owner, has_one = market)]
    pub position: Account<'info, Position>,
}

// ---------- events & errors ----------

#[event]
pub struct PositionOpened {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub long: bool,
    pub margin: u64,
    pub notional: u64,
    pub entry_price: u128,
}

#[event]
pub struct PositionClosed {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub pnl: i64,
    pub payout: u64,
    pub liquidated: bool,
}

#[error_code]
pub enum ErrorCode {
    #[msg("New positions are paused")] Paused,
    #[msg("Leverage is disabled on this coin")] MarketDisabled,
    #[msg("This coin has not unlocked leverage yet")] TierLocked,
    #[msg("Leverage above this coin's tier")] TooMuchLeverage,
    #[msg("Margin above this coin's tier limit")] MarginTooBig,
    #[msg("Long/short capacity for this coin is full")] CapReached,
    #[msg("Minimum hold time not reached")] HoldTime,
    #[msg("Position is not liquidatable")] NotLiquidatable,
    #[msg("Not enough price history yet")] StalePrice,
    #[msg("Vault cannot cover this payout")] VaultEmpty,
    #[msg("Wrong pool account")] BadPool,
    #[msg("Pool byte offsets not configured")] PoolLayoutNotSet,
    #[msg("Math overflow")] MathOverflow,
    #[msg("Unauthorized")] Unauthorized,
}
