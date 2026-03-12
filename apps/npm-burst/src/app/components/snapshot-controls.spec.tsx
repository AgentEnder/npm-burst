import { render, fireEvent } from '@testing-library/react';
import { SnapshotControls } from './snapshot-controls';

vi.mock('lucide-react', () => ({
  ChevronLeft: () => <span data-testid="chevron-left" />,
  ChevronRight: () => <span data-testid="chevron-right" />,
  Zap: () => <span data-testid="zap" />,
}));

describe('SnapshotControls', () => {
  const defaultProps = {
    currentIndex: 1,
    totalSnapshots: 5,
    currentDate: '2026-03-01',
    snapshotDates: ['2026-03-01', '2026-03-05', '2026-03-09'],
    versionReleases: [],
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onLive: vi.fn(),
    onSelectDate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show the current date', () => {
    const { getByText } = render(<SnapshotControls {...defaultProps} />);
    expect(getByText('2026-03-01')).toBeTruthy();
  });

  it('should show "Live" when currentDate is null', () => {
    const { getByText } = render(
      <SnapshotControls {...defaultProps} currentDate={null} />
    );
    expect(getByText('Live', { exact: false })).toBeTruthy();
  });

  it('should disable previous button when currentIndex is 0', () => {
    const { getByTitle } = render(
      <SnapshotControls {...defaultProps} currentIndex={0} />
    );
    const prevButton = getByTitle('Previous snapshot') as HTMLButtonElement;
    expect(prevButton.disabled).toBe(true);
  });

  it('should call onPrevious when previous button is clicked', () => {
    const onPrevious = vi.fn();
    const { getByTitle } = render(
      <SnapshotControls {...defaultProps} onPrevious={onPrevious} />
    );
    fireEvent.click(getByTitle('Previous snapshot'));
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it('should show live link when not in live mode', () => {
    const { getByText } = render(<SnapshotControls {...defaultProps} />);
    expect(getByText('View live data')).toBeTruthy();
  });

  it('should hide live link when in live mode', () => {
    const { queryByText } = render(
      <SnapshotControls {...defaultProps} currentDate={null} />
    );
    expect(queryByText('View live data')).toBeNull();
  });
});
