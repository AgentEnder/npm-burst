import { SiGithub } from '@icons-pack/react-simple-icons';
import styles from './health-report.module.scss';

export type HealthEmptyTone = 'waiting' | 'blocked' | 'missing';

/**
 * Shared frame for every "nothing to show here" state on the health tab.
 *
 * A single left-aligned column inside a bordered panel, with the two actions
 * sharing a row. Tone shows as a hairline accent on the panel's leading edge
 * rather than an icon, which was eating a column of width without saying
 * anything the copy didn't already say.
 */
export function HealthEmptyShell({
  title,
  tone = 'blocked',
  repo,
  body,
  actions,
  footer,
}: {
  title: string;
  /**
   * `waiting` — the data is on its way and nobody needs to act.
   * `blocked` — someone has to connect or install something.
   * `missing` — there is nothing to track in the first place.
   */
  tone?: HealthEmptyTone;
  repo?: { owner: string; name: string };
  body: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const repoPath = repo ? `${repo.owner}/${repo.name}` : null;

  return (
    <div className={styles.emptyState}>
      <div className={`${styles.emptyPanel} ${styles[`tone_${tone}`]}`}>
        <div className={styles.emptyBody}>
          <div className={styles.emptyHeading}>
            <h2 className={styles.emptyTitle}>{title}</h2>
            {/* Metadata, not a label: an unboxed line under the title rather
                than a filled chip competing with the heading beside it. */}
            {repo && repoPath ? (
              <a
                className={styles.repoMeta}
                href={`https://github.com/${repo.owner}/${repo.name}`}
                target="_blank"
                rel="noreferrer"
                title={repoPath}
              >
                <SiGithub size={11} />
                <span className={styles.repoMetaName}>{repoPath}</span>
              </a>
            ) : null}
          </div>

          <p className={styles.emptyHint}>{body}</p>

          {actions ? (
            <div className={styles.emptyActions}>{actions}</div>
          ) : null}
          {footer}
        </div>
      </div>
    </div>
  );
}
