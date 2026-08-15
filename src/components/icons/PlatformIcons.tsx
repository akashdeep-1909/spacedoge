// Same "simple geometric marks, no external icon library" convention
// as SocialIcons.tsx — see that file's doc-comment. currentColor so
// callers size/tint these like any other inline icon.

// The Android robot ("bugdroid") head — unlike most brand marks, Google
// explicitly publishes this one under a Creative Commons Attribution
// 3.0 license (developer.android.com/distribute/marketing-tools/brand-
// guidelines) specifically so it can be reused to indicate Android
// compatibility, which is exactly this badge's purpose. Deliberately
// NOT the Google Play "triangle" logo — that mark is Google Play's own
// trademark, and this app has no Play Store listing (it's a direct-
// download APK), so using it here would misrepresent one.
export function AndroidIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden>
      <path d="M7.5 6.2L6 4.2M16.5 6.2L18 4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 13a7 7 0 0114 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9.3" cy="10.2" r="1" fill="currentColor" />
      <circle cx="14.7" cy="10.2" r="1" fill="currentColor" />
    </svg>
  );
}

// A generic phone-in-front-of-tablet pair for the iOS badge. This is
// deliberately NOT Apple's logo — Apple doesn't license its mark the
// way Google licenses the Android robot, and this app has no App
// Store listing (it's a home-screen web app, see /install-ios), so an
// Apple mark here would both misuse a trademark and imply a listing
// that doesn't exist. Two plain rounded-rect device outlines still
// read clearly as "phone + tablet" alongside the "iPhone & iPad" label
// without borrowing anyone's brand mark.
export function DeviceDuoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden>
      <rect x="9" y="3" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
      <rect x="3" y="7" width="8.5" height="14.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <line x1="6" y1="18.6" x2="8.3" y2="18.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
