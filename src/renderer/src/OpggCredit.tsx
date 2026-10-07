import { t } from '../../shared/i18n'

// OP.GG allows Glyph to use its data on the condition that the OP.GG logo, at least 80×30, and a
// link to https://op.gg are shown whenever that data is (reply to opgginc/opgg-mcp#17, Oct 2026).
// The wordmark is the one from OP.GG's own site header; at 30px high it is about 124px wide.
const LOGO_HEIGHT = 30
const VIEW_BOX = '0 0 66 16'
const [, , VIEW_WIDTH, VIEW_HEIGHT] = VIEW_BOX.split(' ').map(Number)
const PATH =
  'M8.025 12.203C5.7 12.203 3.808 10.318 3.808 8S5.7 3.796 8.025 3.796 12.241 5.682 12.241 8s-1.891 4.203-4.216 4.203M8.025 0C3.6 0 0 3.589 0 8s3.6 8 8.025 8 8.025-3.589 8.025-8-3.6-8-8.025-8m17.517 8.498H21.18V3.7h4.362c1.505 0 1.964 1.412 1.964 2.398 0 1.017-.46 2.399-1.964 2.399m5.754-2.399c0-3.44-2.357-6.096-5.736-6.096h-7.98v15.984h3.6v-3.792h4.38c3.258 0 5.736-2.638 5.736-6.096m10.656.938H49.1c.018.2.04.516.055.96.027.744-.013 1.2-.163 2.098-.608 3.635-3.43 5.894-7.365 5.894-4.421 0-8.018-3.585-8.018-7.992 0-4.408 3.597-7.994 8.017-7.994a8.01 8.01 0 0 1 6.135 2.85l.226.268-.292.194-2.593 1.724-.216.144-.182-.186c-.82-.835-1.912-1.224-3.078-1.224-2.375 0-4.308 1.855-4.308 4.224 0 2.367 1.933 4.294 4.309 4.294 2.008 0 3.34-1.13 3.6-2.392h-3.275zm23.986.002h-7.15v2.862h3.277c-.261 1.26-1.593 2.392-3.602 2.392-2.375 0-4.308-1.927-4.308-4.295s1.933-4.223 4.308-4.223c1.165 0 2.258.389 3.078 1.224l.182.186.217-.144 2.592-1.724.293-.194-.227-.268a8.01 8.01 0 0 0-6.135-2.85c-4.42 0-8.017 3.586-8.017 7.993 0 4.408 3.596 7.993 8.017 7.993 3.936 0 6.758-2.258 7.366-5.894.15-.898.19-1.354.163-2.098-.015-.444-.037-.76-.055-.96m-36.269 7.326a1.626 1.626 0 0 1 3.254 0 1.626 1.626 0 0 1-3.254 0'

export function OpggCredit() {
  return (
    <a
      href="https://op.gg"
      target="_blank"
      rel="noreferrer"
      title="https://op.gg"
      className="flex shrink-0 items-center gap-3 rounded-control px-2 py-1 text-xs text-mute transition-colors hover:bg-raised hover:text-bone"
    >
      {t('Statistiken von')}
      <svg
        role="img"
        aria-label="OP.GG"
        height={LOGO_HEIGHT}
        width={Math.round((LOGO_HEIGHT * VIEW_WIDTH) / VIEW_HEIGHT)}
        viewBox={VIEW_BOX}
        className="text-bone"
      >
        <path fill="currentColor" fillRule="evenodd" d={PATH} />
      </svg>
    </a>
  )
}
