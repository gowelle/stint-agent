import React from 'react';
import { Box, Text } from 'ink';

interface StatusRowProps {
    label: string;
    value: string | React.ReactNode;
    labelWidth?: number;
}

/**
 * A key-value row for displaying status information.
 */
export function StatusRow({ label, value, labelWidth = 12 }: StatusRowProps): React.ReactElement {
    return (
        <Box>
            <Text bold>{label.padEnd(labelWidth)}</Text>
            {typeof value === 'string' ? <Text>{value}</Text> : value}
        </Box>
    );
}
