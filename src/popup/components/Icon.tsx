export function Icon({ name }: { name: 'play' | 'arrow-right' | 'arrow-left' | 'arrow-up-right' | 'close' | 'coffee' }) {
  const paths = {
    play: 'm5 3 8 5-8 5Z',
    'arrow-right': 'M3 8h10m-4-4 4 4-4 4',
    'arrow-left': 'M13 8H3m4-4-4 4 4 4',
    'arrow-up-right': 'M4 12l8-8M4 4h8v8',
    close: 'M4 4l8 8M12 4l-8 8',
    coffee: 'M3 6h8v5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm8 1h1a2 2 0 0 1 0 4h-1M5 2v1m3-1v1',
  };
  return <svg className="ui-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={paths[name]} fill={name === 'play' ? 'currentColor' : 'none'} stroke={name === 'play' ? 'none' : 'currentColor'} />
  </svg>;
}
