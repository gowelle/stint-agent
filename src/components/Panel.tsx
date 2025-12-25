import React from 'react';
import { Box, Text } from 'ink';

interface PanelProps {
    title: string;
    icon?: string;
    children: React.ReactNode;
}

/**
 * A bordered panel with a title header for the TUI dashboard.
 */
export function Panel({ title, icon, children }: PanelProps): React.ReactElement {
    return (
        <Box flexDirection="column" marginBottom={1}>
            <Text color="blue">
                {icon ? `${icon} ` : ''}{title}:
            </Text>
            <Text color="gray">{'─'.repeat(50)}</Text>
            <Box flexDirection="column" paddingLeft={0}>
                {children}
            </Box>
        </Box>
    );
}
