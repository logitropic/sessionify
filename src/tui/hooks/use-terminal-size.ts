import { useEffect, useState } from 'react';
import { useStdout } from 'ink';

export type TerminalSize = {
  columns: number;
  rows: number;
};

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [terminalSize, setTerminalSize] = useState<TerminalSize>(() => ({
    columns: stdout.columns || 80,
    rows: stdout.rows || 24,
  }));

  useEffect(() => {
    const update = () => {
      setTerminalSize({
        columns: stdout.columns || 80,
        rows: stdout.rows || 24,
      });
    };

    update();
    stdout.on('resize', update);

    return () => {
      stdout.off('resize', update);
    };
  }, [stdout]);

  return terminalSize;
}
