import React from 'react';
import { Group, Arrow, Text } from 'react-konva';
import { useTheme } from '../../context/ThemeContext';
import { Gsrsm_CONDITION_FONT_SIZE } from '../../models/constants';


interface GsrsmConnectionProps {
  points: number[];
  dash?: number[];
  pointerLength?: number;
  pointerWidth?: number;
  pointerAtBeginning?: boolean;
  pointerAtEnding?: boolean;
  strokeWidth?: number;
  highlighted?: boolean;
  condition?: string;
  activated?: boolean;
  onDoubleClick?: () => void;
  onContextMenu?: (e: any) => void;
}

const GsrsmConnection: React.FC<GsrsmConnectionProps> = ({
  points,
  dash = [8, 4],
  pointerLength = 10,
  pointerWidth = 8,
  pointerAtBeginning = false,
  pointerAtEnding = true,
  strokeWidth = 1,
  highlighted = false,
  condition,
  activated = true, // Default true for backward compat, but controlled by parent
  onDoubleClick,
  onContextMenu,
}) => {
  const { theme } = useTheme();

  // Validation: Ensure points are valid numbers and we have at least start and end (x1, y1, x2, y2)
  const isValid = React.useMemo(() => {
    if (!Array.isArray(points) || points.length < 4) return false;
    // Check for NaN or duplicate start/end points which can cause Konva issues
    if (points.some(p => !Number.isFinite(p))) return false;

    // Check total approximate length to avoid zero-length arrows
    let totalLength = 0;
    for (let i = 0; i < points.length - 2; i += 2) {
      const dx = points[i + 2] - points[i];
      const dy = points[i + 3] - points[i + 1];
      totalLength += Math.abs(dx) + Math.abs(dy);
    }

    if (totalLength < 0.1) return false;

    return true;
  }, [points]);

  if (!isValid) return null;

  // Get line color based on theme and connection state
  const getLineColor = () => {
    // Highlighted connections get vibrant sky blue
    if (highlighted) {
      return (theme as any).gsrsmConnectionHighlight || (theme.mode === 'light' ? '#0ea5e9' : '#38bdf8');
    }

    // All connections (activated and deactivated) use solid black/white
    return (theme as any).gsrsmConnectionInactive || (theme.mode === 'light' ? '#000000' : '#ffffff');
  };

  // Get stroke width based on highlighting state
  const getStrokeWidth = () => {
    return highlighted ? strokeWidth + 2 : strokeWidth;
  };

  // Get dash pattern based on connection state
  const getDashPattern = () => {
    if (highlighted) {
      return [12, 6]; // Longer dashes for highlighted
    }
    if (!activated) {
      return [8, 4]; // Standard dashes for deactivated connections
    }
    return dash; // Use provided dash for activated connections
  };

  // Use 50% opacity for deactivated connections as requested
  const opacity = activated ? 1 : 0.5;


  const lineColor = getLineColor();

  // Calculate position for the condition (midpoint of the path)
  const getConditionPosition = () => {
    if (!points || points.length < 4) return { x: 0, y: 0, angle: 0 };

    // Calculate total length
    let totalLength = 0;
    const segments = [];
    for (let i = 0; i < points.length - 2; i += 2) {
      const x1 = points[i];
      const y1 = points[i + 1];
      const x2 = points[i + 2];
      const y2 = points[i + 3];
      const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
      segments.push({ x1, y1, x2, y2, length });
      totalLength += length;
    }

    // Find middle point
    let remainingLength = totalLength / 2;
    let midSegment = segments[0];

    for (const segment of segments) {
      if (remainingLength <= segment.length) {
        midSegment = segment;
        break;
      }
      remainingLength -= segment.length;
    }

    // Calculate point on segment
    const ratio = midSegment.length > 0 ? remainingLength / midSegment.length : 0;
    const x = midSegment.x1 + (midSegment.x2 - midSegment.x1) * ratio;
    const y = midSegment.y1 + (midSegment.y2 - midSegment.y1) * ratio;

    // Determine if segment is vertical or horizontal for better placement
    const isVertical = Math.abs(midSegment.x1 - midSegment.x2) < 1;

    return { x, y, isVertical };
  };

  const conditionPos = getConditionPosition();

  return (
    <Group
      onDblClick={onDoubleClick}
      onContextMenu={onContextMenu}
      opacity={opacity}
    >
      {/* Hitbox for easier selection/double click */}
      <Arrow
        points={points}
        stroke="transparent"
        strokeWidth={10} // invisible wider stroke for easier clicking
      />

      <Arrow
        points={points}
        stroke={lineColor}
        strokeWidth={getStrokeWidth()}
        dash={getDashPattern()}
        pointerLength={pointerLength}
        pointerWidth={pointerWidth}
        pointerAtBeginning={pointerAtBeginning}
        pointerAtEnding={pointerAtEnding}
        fill={lineColor}
      />

      {condition && conditionPos && (
        <Group x={conditionPos.x} y={conditionPos.y}>
          {/* Condition Text - centered above the line */}
          <Text
            text={condition}
            x={-(condition.length * 3.5)}
            y={-20}
            fontSize={activated ? Gsrsm_CONDITION_FONT_SIZE : Gsrsm_CONDITION_FONT_SIZE - 2}
            fontStyle="bold"
            fill={lineColor}
            align="center"
          />

        </Group>
      )}
    </Group>
  );
};

export default GsrsmConnection;
