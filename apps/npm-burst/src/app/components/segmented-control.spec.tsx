import { render, fireEvent } from '@testing-library/react';
import { SegmentedControl } from './segmented-control';

// jsdom does not provide ResizeObserver
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

describe('SegmentedControl', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
  ];

  it('should render all option labels', () => {
    const { getAllByText } = render(
      <SegmentedControl options={options} value="a" onChange={() => {}} />
    );
    // Each label appears twice: once as a button (desktop) and once as an option (mobile)
    expect(getAllByText('Alpha').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Beta').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Gamma').length).toBeGreaterThanOrEqual(1);
  });

  it('should call onChange with the new value when clicked', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <SegmentedControl options={options} value="a" onChange={onChange} />
    );
    fireEvent.click(getByRole('button', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('should not call onChange when clicking the active option', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <SegmentedControl options={options} value="a" onChange={onChange} />
    );
    fireEvent.click(getByRole('button', { name: 'Alpha' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should render an optional label prefix', () => {
    const { getAllByText } = render(
      <SegmentedControl
        options={options}
        value="a"
        onChange={() => {}}
        label="Group by"
      />
    );
    // Label appears in both desktop and mobile views
    expect(getAllByText('Group by').length).toBeGreaterThanOrEqual(1);
  });

  it('should render a select dropdown for mobile', () => {
    const { container } = render(
      <SegmentedControl options={options} value="b" onChange={() => {}} />
    );
    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    expect((select as HTMLSelectElement).value).toBe('b');
  });
});
