-- Admin-controlled weekly leaderboard reward. Defaults to OFF (no pool
-- amount set) so no reward is paid until an admin explicitly enables it
-- and sets a pool size in /admin/settings — until then the leaderboard
-- still shows real rankings, just $0 reward.
ALTER TABLE "PlatformSettings" ADD COLUMN "weeklyLeaderboardEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformSettings" ADD COLUMN "weeklyLeaderboardPoolUsdt" DECIMAL(24,8);
