import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { getPlatformSettings, updatePlatformSettings, DEFAULT_MIN_USDT_WITHDRAWAL, DEFAULT_MIN_DOGE_WITHDRAWAL } from "@/lib/settings";

// GET /api/admin/settings — the raw DB overrides (nullable) plus their
// built-in defaults, so the admin UI can show "using default: $5" vs.
// "overridden" without a second round trip. Treasury/deposit-chain
// config lives in DepositChainConfig now (see /api/admin/settings/
// deposit-chains) — this route is just withdrawal minimums + socials.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const settings = await getPlatformSettings();

  return NextResponse.json({
    minUsdtWithdrawal: settings.minUsdtWithdrawal !== null ? Number(settings.minUsdtWithdrawal) : null,
    minDogeWithdrawal: settings.minDogeWithdrawal !== null ? Number(settings.minDogeWithdrawal) : null,
    twitterUrl: settings.twitterUrl,
    telegramUrl: settings.telegramUrl,
    discordUrl: settings.discordUrl,
    youtubeUrl: settings.youtubeUrl,
    instagramUrl: settings.instagramUrl,
    facebookUrl: settings.facebookUrl,
    linkedinUrl: settings.linkedinUrl,
    redditUrl: settings.redditUrl,
    tiktokUrl: settings.tiktokUrl,
    mediumUrl: settings.mediumUrl,
    walletConnectProjectId: settings.walletConnectProjectId,
    weeklyLeaderboardEnabled: settings.weeklyLeaderboardEnabled,
    weeklyLeaderboardPoolUsdt: settings.weeklyLeaderboardPoolUsdt !== null ? Number(settings.weeklyLeaderboardPoolUsdt) : null,
    docsMenuEnabled: settings.docsMenuEnabled,
    updatedAt: settings.updatedAt,
    updatedByAddress: settings.updatedByAddress,
    defaults: {
      minUsdtWithdrawal: DEFAULT_MIN_USDT_WITHDRAWAL,
      minDogeWithdrawal: DEFAULT_MIN_DOGE_WITHDRAWAL,
      // No built-in fallback value to show here (unlike the withdrawal
      // minimums) — env-var fallback isn't a fixed number the admin UI
      // can display, it's just "leave blank to use whatever
      // NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set to on the server."
    },
  });
}

// Every field is optional and nullable — sending null clears an
// override back to the built-in default, omitting a field leaves it
// untouched. Empty strings are treated the same as null (a blank input
// field means "no override," not a literal empty string value).
const bodySchema = z.object({
  minUsdtWithdrawal: z.number().positive().nullable().optional(),
  minDogeWithdrawal: z.number().positive().nullable().optional(),
  twitterUrl: z.string().nullable().optional(),
  telegramUrl: z.string().nullable().optional(),
  discordUrl: z.string().nullable().optional(),
  youtubeUrl: z.string().nullable().optional(),
  instagramUrl: z.string().nullable().optional(),
  facebookUrl: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  redditUrl: z.string().nullable().optional(),
  tiktokUrl: z.string().nullable().optional(),
  mediumUrl: z.string().nullable().optional(),
  walletConnectProjectId: z.string().nullable().optional(),
  weeklyLeaderboardEnabled: z.boolean().optional(),
  weeklyLeaderboardPoolUsdt: z.number().positive().nullable().optional(),
  docsMenuEnabled: z.boolean().optional(),
});

function normalize(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  const updated = await updatePlatformSettings(
    {
      minUsdtWithdrawal: body.minUsdtWithdrawal,
      minDogeWithdrawal: body.minDogeWithdrawal,
      twitterUrl: normalize(body.twitterUrl),
      telegramUrl: normalize(body.telegramUrl),
      discordUrl: normalize(body.discordUrl),
      youtubeUrl: normalize(body.youtubeUrl),
      instagramUrl: normalize(body.instagramUrl),
      facebookUrl: normalize(body.facebookUrl),
      linkedinUrl: normalize(body.linkedinUrl),
      redditUrl: normalize(body.redditUrl),
      tiktokUrl: normalize(body.tiktokUrl),
      mediumUrl: normalize(body.mediumUrl),
      walletConnectProjectId: normalize(body.walletConnectProjectId),
      weeklyLeaderboardEnabled: body.weeklyLeaderboardEnabled,
      weeklyLeaderboardPoolUsdt: body.weeklyLeaderboardPoolUsdt,
      docsMenuEnabled: body.docsMenuEnabled,
    },
    session.address.toLowerCase()
  );

  return NextResponse.json({ ok: true, updatedAt: updated.updatedAt });
}
