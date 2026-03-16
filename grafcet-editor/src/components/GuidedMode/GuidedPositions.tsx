import React, { useState, useEffect } from 'react';
import { Group, Rect, Circle, Text } from 'react-konva';
import { useEditorStore } from '../../store/useEditorStore';
import { useElementsStore } from '../../store/useElementsStore';
import { usePopupStore } from '../../store/usePopupStore';

import { Step, Point } from '../../models/types';

// Type guard to check if an element is a Step with stepType
const isStepWithType = (element: any): element is Step & { stepType: string } => {
  return element.type === 'step' && 'stepType' in element;
};



import {
  DEFAULT_STEP_SIZE,
  DEFAULT_TRANSITION_SIZE,
  GUIDED_STEP_SPACING_VERTICAL,
  GUIDED_DIVERGENCE_SPACING,
  GUIDED_DIVERGENCE_BRANCHES,
  DEFAULT_GATE_SIZE
} from '../../models/constants';
import { createConnectionSegment } from '../../models/GrafcetElements';
import { findNearestOpenDivergence, DivergenceType } from '../../utils/sfcTraversal';
import { GrafcetElement, Gate, Transition } from '../../models/types';

interface GuidedPositionsProps {
  step: Step;
}

// Interface for tracking dynamic divergence positions
interface DivergenceState {
  maxLeftIndex: number;
  maxRightIndex: number;
  positions: Record<string, Point>;
}

// Enhanced Button Component for better UX
interface AnimatedButtonProps {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  onClick: () => void;
  fill: string;
  hoverFill?: string;
  fontSize?: number;
  disabled?: boolean;
  icon?: string;
}

const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  x, y, width, height, text, onClick, fill, hoverFill, fontSize = 12, disabled = false, icon
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [scale, setScale] = useState(1);

  // Calculate colors
  const actualFill = disabled ? '#cccccc' : isPressed ? darkenColor(fill, 20) : isHovered ? (hoverFill || lightenColor(fill, 15)) : fill;
  const textColor = disabled ? '#888888' : 'white';
  const actualScale = disabled ? 1 : scale;

  // Helper function to lighten a color
  function lightenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, ((num >> 16) & 0xff) + amt);
    const G = Math.min(255, ((num >> 8) & 0xff) + amt);
    const B = Math.min(255, (num & 0xff) + amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
  }

  // Helper function to darken a color
  function darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, ((num >> 16) & 0xff) - amt);
    const G = Math.max(0, ((num >> 8) & 0xff) - amt);
    const B = Math.max(0, (num & 0xff) - amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
  }

  const handleMouseEnter = () => {
    if (!disabled) {
      setIsHovered(true);
      setScale(1.03); // Slight scale up on hover
    }
  };

  const handleMouseLeave = () => {
    if (!disabled) {
      setIsHovered(false);
      setIsPressed(false);
      setScale(1);
    }
  };

  const handleMouseDown = () => {
    if (!disabled) {
      setIsPressed(true);
      setScale(0.97); // Slight scale down on press
    }
  };

  const handleMouseUp = () => {
    if (!disabled) {
      setIsPressed(false);
      setScale(isHovered ? 1.03 : 1);
    }
  };

  const handleClick = () => {
    if (!disabled) {
      onClick();
    }
  };

  return (
    <Group
      x={x}
      y={y}
      scaleX={actualScale}
      scaleY={actualScale}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
    >
      <Rect
        width={width}
        height={height}
        fill={actualFill}
        cornerRadius={6}
        shadowColor="black"
        shadowBlur={isHovered ? 8 : 5}
        shadowOffset={{ x: 2, y: 2 }}
        shadowOpacity={isHovered ? 0.4 : 0.3}
        stroke={isHovered && !disabled ? "#ffffff" : undefined}
        strokeWidth={isHovered && !disabled ? 1 : 0}
      />

      {icon && (
        <Text
          x={8}
          width={20}
          height={height}
          text={icon}
          fontSize={fontSize + 2}
          fontStyle="bold"
          fill={textColor}
          align="center"
          verticalAlign="middle"
        />
      )}

      <Text
        x={icon ? 28 : 0}
        width={icon ? width - 28 : width}
        height={height}
        text={text}
        fontSize={fontSize}
        fontStyle="bold"
        fill={textColor}
        align="center"
        verticalAlign="middle"
      />
    </Group>
  );
};


const DivergenceActionMenu: React.FC<{
  type: DivergenceType;
  x: number;
  y: number;
  title: string;
  onClose: () => void;
  onDelete: () => void;
}> = ({ type, x, y, title, onClose, onDelete }) => (
  <Group
    x={x}
    y={y}
  >
    {/* Container Background - Vertical List Style */}
    <Rect
      width={120}
      height={100}
      fill="#ffffff"
      stroke="#e0e0e0"
      strokeWidth={1}
      cornerRadius={8}
      shadowColor="black"
      shadowBlur={10}
      shadowOpacity={0.15}
      shadowOffset={{ x: 0, y: 4 }}
    />

    {/* Title Header */}
    <Text
      x={0}
      y={8}
      width={120}
      text={title}
      fontSize={10}
      fontStyle="bold"
      fill="#757575"
      align="center"
    />

    {/* Divider */}
    <Rect
      x={10}
      y={25}
      width={100}
      height={1}
      fill="#f0f0f0"
    />

    {/* Converge Button */}
    <Group
      x={5}
      y={30}
      onClick={(e) => {
        e.cancelBubble = true;
        onClose();
      }}
      onMouseEnter={(e) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'pointer';
      }}
      onMouseLeave={(e) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'default';
      }}
    >
      <Rect
        width={110}
        height={32}
        fill={type === 'AND' ? '#e8f5e9' : '#e3f2fd'}
        cornerRadius={6}
      />
      <Text
        x={35}
        y={0}
        width={75}
        height={32}
        text="Converge"
        fontSize={12}
        fontStyle="bold"
        fill={type === 'AND' ? '#2e7d32' : '#1565c0'}
        align="left"
        verticalAlign="middle"
      />
      {/* Icon */}
      <Text
        x={0}
        y={0}
        width={35}
        height={32}
        text="⊣"
        fontSize={18}
        fill={type === 'AND' ? '#2e7d32' : '#1565c0'}
        align="center"
        verticalAlign="middle"
      />
    </Group>

    {/* Discard Button */}
    <Group
      x={5}
      y={66}
      onClick={(e) => {
        e.cancelBubble = true;
        onDelete();
      }}
      onMouseEnter={(e) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'pointer';
      }}
      onMouseLeave={(e) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'default';
      }}
    >
      <Rect
        width={110}
        height={32}
        fill="#ffebee"
        cornerRadius={6}
      />
      <Text
        x={35}
        y={0}
        width={75}
        height={32}
        text="Discard"
        fontSize={12}
        fontStyle="bold"
        fill="#c62828"
        align="left"
        verticalAlign="middle"
      />
      {/* Icon */}
      <Text
        x={0}
        y={0}
        width={35}
        height={32}
        text="🗑️"
        fontSize={14}
        align="center"
        verticalAlign="middle"
      />
    </Group>
  </Group>
);

// Creation Menu Component
const DivergenceCreationMenu: React.FC<{
  type: DivergenceType;
  x: number;
  y: number;
  count: number;
  onCreate: () => void;
  onCancel: () => void;
}> = ({ type, x, y, count, onCreate, onCancel }) => (
  <Group
    x={x}
    y={y}
  >
    {/* Container */}
    <Rect
      width={140}
      height={85}
      fill="#ffffff"
      stroke="#e0e0e0"
      strokeWidth={1}
      cornerRadius={8}
      shadowColor="black"
      shadowBlur={10}
      shadowOpacity={0.15}
      shadowOffset={{ x: 0, y: 4 }}
    />

    {/* Create Button */}
    <Group
      x={5}
      y={5}
      onClick={(e) => {
        e.cancelBubble = true;
        if (count > 0) onCreate();
      }}
      opacity={count > 0 ? 1 : 0.5}
      onMouseEnter={(e) => {
        if (count > 0) {
          const container = e.target.getStage()?.container();
          if (container) container.style.cursor = 'pointer';
        }
      }}
      onMouseLeave={(e) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'default';
      }}
    >
      <Rect
        width={130}
        height={35}
        fill={type === 'AND' ? '#1976d2' : '#2196f3'}
        cornerRadius={6}
      />
      <Text
        x={35}
        y={0}
        width={95}
        height={35}
        text={`Create ${type} (${count})`}
        fontSize={12}
        fontStyle="bold"
        fill="white"
        align="left"
        verticalAlign="middle"
      />
      <Text
        x={0}
        y={0}
        width={35}
        height={35}
        text={type === 'AND' ? "⋀" : "⋁"}
        fontSize={16}
        fill="white"
        align="center"
        verticalAlign="middle"
      />
    </Group>

    {/* Cancel Button */}
    <Group
      x={5}
      y={45}
      onClick={(e) => {
        e.cancelBubble = true;
        onCancel();
      }}
      onMouseEnter={(e) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'pointer';
      }}
      onMouseLeave={(e) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'default';
      }}
    >
      <Rect
        width={130}
        height={35}
        fill="#f44336"
        cornerRadius={6}
      />
      <Text
        x={35}
        y={0}
        width={95}
        height={35}
        text="Cancel"
        fontSize={12}
        fontStyle="bold"
        fill="white"
        align="left"
        verticalAlign="middle"
      />
      <Text
        x={0}
        y={0}
        width={35}
        height={35}
        text="✕"
        fontSize={14}
        fill="white"
        align="center"
        verticalAlign="middle"
      />
    </Group>
  </Group>
);

const GuidedPositions: React.FC<GuidedPositionsProps> = ({ step }) => {
  const { addStep, addConnection, addTransition, addGate } = useElementsStore();
  const { setLastPlacedStepId } = useEditorStore();

  // No longer needed as we rely on useElementsStore.getNextTransitionNumber()

  // State for hover effects
  const [hoveredPosition, setHoveredPosition] = useState<string | null>(null);
  const [selectedDivergencePositions, setSelectedDivergencePositions] = useState<string[]>([]);

  // State for dynamic divergence positions
  const [divergenceState, setDivergenceState] = useState<DivergenceState>({
    maxLeftIndex: 1,
    maxRightIndex: 1,
    positions: {}
  });

  // Removed manual convergence state as we rely on auto-detection now
  // const [divergenceSteps, setDivergenceSteps] = useState<Step[]>([]);
  // const [showConvergence, setShowConvergence] = useState<boolean>(false);
  // const [divergenceStructureSteps, setDivergenceStructureSteps] = useState<Step[]>([]);

  // State for advanced divergence creation
  const [isDivergenceMode, setIsDivergenceMode] = useState<boolean>(false);
  const [horizontalSteps, setHorizontalSteps] = useState<{ position: Point, key: string }[]>([]);
  const [verticalSteps, setVerticalSteps] = useState<{ parentKey: string, positions: { position: Point, key: string }[] }[]>([]);
  const [selectedHorizontalStep, setSelectedHorizontalStep] = useState<string | null>(null);
  const [divergenceType, setDivergenceType] = useState<'AND' | 'OR' | null>(null);

  // State to track all steps that should show suggestions (for multi-step highlighting)
  const [activeSteps, setActiveSteps] = useState<Step[]>([]);

  // State for detected open reference
  const [detectedOpenDivergence, setDetectedOpenDivergence] = useState<{
    isOpen: boolean;
    type: DivergenceType;
    divergenceStart: Step | Gate | null;
    branchTips: GrafcetElement[];
  } | null>(null);

  // Animation state - removed unused animation variables

  // Initialize divergence positions
  useEffect(() => {
    // Get all steps to find the initial step
    const allSteps = useElementsStore.getState().elements.filter(e => e.type === 'step');
    const initialStep = allSteps.find(s => isStepWithType(s) && s.stepType === 'initial');

    // Use the initial step's x position for alignment if available, otherwise use current step
    const alignmentX = initialStep ? initialStep.position.x : step.position.x;

    // Calculate the center position
    const initialPositions: Record<string, Point> = {
      'down': {
        x: alignmentX,
        y: step.position.y + GUIDED_STEP_SPACING_VERTICAL
      },
      // Initial left position
      'downLeft1': {
        x: alignmentX - GUIDED_DIVERGENCE_SPACING,
        y: step.position.y + GUIDED_STEP_SPACING_VERTICAL
      },
      // Initial right position
      'downRight1': {
        x: alignmentX + GUIDED_DIVERGENCE_SPACING,
        y: step.position.y + GUIDED_STEP_SPACING_VERTICAL
      }
    };

    setDivergenceState({
      maxLeftIndex: 1,
      maxRightIndex: 1,
      positions: initialPositions
    });
    setDivergenceState({
      maxLeftIndex: 1,
      maxRightIndex: 1,
      positions: initialPositions
    });
  }, [step.position.x, step.position.y]);

  // Check for open divergences whenever the step or elements change
  useEffect(() => {
    const elements = useElementsStore.getState().elements;
    const result = findNearestOpenDivergence(step.id, elements);
    setDetectedOpenDivergence(result);
  }, [step.id, useElementsStore.getState().elements]);


  // Listen for resetActiveSteps event from Step component
  useEffect(() => {
    const handleResetActiveSteps = (event: any) => {
      const { step: clickedStep } = event.detail;

      // Reset active steps to only include the clicked step
      if (clickedStep) {
        setActiveSteps([clickedStep]);
      } else {
        setActiveSteps([]);
      }
    };

    window.addEventListener('resetActiveSteps', handleResetActiveSteps);

    return () => {
      window.removeEventListener('resetActiveSteps', handleResetActiveSteps);
    };
  }, []);

  // Generate divergence positions based on current state
  const generateDivergencePositions = () => {
    return divergenceState.positions;
  };

  // Get the alignment X position (from initial step if available)
  const getAlignmentX = () => {
    const allSteps = useElementsStore.getState().elements.filter(e => e.type === 'step');
    const initialStep = allSteps.find(s => isStepWithType(s) && s.stepType === 'initial');
    return initialStep ? initialStep.position.x : step.position.x;
  };

  // Get the initial step if it exists
  const getInitialStep = (): Step | null => {
    const allSteps = useElementsStore.getState().elements.filter(e => e.type === 'step') as Step[];
    return allSteps.find(s => s.stepType === 'initial') || null;
  };

  // Add a new divergence position to the right
  const addRightDivergencePosition = () => {
    const newIndex = divergenceState.maxRightIndex + 1;
    if (newIndex <= Math.floor(GUIDED_DIVERGENCE_BRANCHES / 2)) {
      const alignmentX = getAlignmentX();
      const newPositions = { ...divergenceState.positions };
      newPositions[`downRight${newIndex}`] = {
        x: alignmentX + (GUIDED_DIVERGENCE_SPACING * newIndex),
        y: step.position.y + GUIDED_STEP_SPACING_VERTICAL
      };

      setDivergenceState({
        ...divergenceState,
        maxRightIndex: newIndex,
        positions: newPositions
      });
    }
  };

  // Add a new divergence position to the left
  const addLeftDivergencePosition = () => {
    const newIndex = divergenceState.maxLeftIndex + 1;
    if (newIndex <= Math.floor(GUIDED_DIVERGENCE_BRANCHES / 2)) {
      const alignmentX = getAlignmentX();
      const newPositions = { ...divergenceState.positions };
      newPositions[`downLeft${newIndex}`] = {
        x: alignmentX - (GUIDED_DIVERGENCE_SPACING * newIndex),
        y: step.position.y + GUIDED_STEP_SPACING_VERTICAL
      };

      setDivergenceState({
        ...divergenceState,
        maxLeftIndex: newIndex,
        positions: newPositions
      });
    }
  };

  // Generate vertical positions below a selected horizontal step
  const generateVerticalPositions = () => {
    if (!selectedHorizontalStep || !isDivergenceMode) return {};

    // Find the selected horizontal step
    const selectedStep = horizontalSteps.find(hs => hs.key === selectedHorizontalStep);
    if (!selectedStep) return {};

    // Generate positions below the selected step
    const verticalPositions: Record<string, Point> = {
      [`vertical_${selectedHorizontalStep}`]: {
        x: selectedStep.position.x,
        y: selectedStep.position.y + GUIDED_STEP_SPACING_VERTICAL
      }
    };

    return verticalPositions;
  };

  // Calculate all possible positions
  const positions = isDivergenceMode && selectedHorizontalStep
    ? generateVerticalPositions()
    : {
      // Only keep the down position, removing up, left, and right
      down: { x: step.position.x, y: step.position.y + GUIDED_STEP_SPACING_VERTICAL },

      // Divergence positions
      ...generateDivergencePositions()
    };

  // Ensure 'down' is always present for the Close button anchor if standard positions are empty (rare)
  if (!positions.down) {
    positions.down = { x: step.position.x, y: step.position.y + GUIDED_STEP_SPACING_VERTICAL };
  }


  // Start divergence creation mode
  const startDivergenceMode = (initialPositionKey?: string) => {
    // Store the initial position key if provided
    if (initialPositionKey) {
      // Remember this position to select after the user chooses a type
      useEditorStore.setState({ _pendingDivergencePosition: initialPositionKey });
    }

    // Use the professional popup system instead of custom Konva popup
    const { showPopup } = usePopupStore.getState();

    showPopup(
      'info',
      'Select Divergence Type',
      'Choose the type of divergence structure to create:',
      (value) => {
        if (value === 'AND' || value === 'OR') {
          startDivergenceModeWithType(value as 'AND' | 'OR');
        }
      },
      '',
      ''
    );

    // Add custom buttons to the popup via DOM after it's created
    setTimeout(() => {
      const popupActions = document.querySelector('.popup-actions');
      if (popupActions) {
        // Clear default buttons
        popupActions.innerHTML = '';

        // Create AND button
        const andButton = document.createElement('button');
        andButton.className = 'popup-button and-button';
        andButton.innerHTML = '<span style="font-size: 18px; margin-right: 8px;">⋀</span> AND';
        andButton.style.backgroundColor = '#4caf50';
        andButton.style.color = 'white';
        andButton.style.border = 'none';
        andButton.style.borderRadius = '4px';
        andButton.style.padding = '10px 20px';
        andButton.style.margin = '0 10px';
        andButton.style.cursor = 'pointer';
        andButton.style.fontWeight = 'bold';
        andButton.onclick = () => {
          usePopupStore.getState().hidePopup();
          startDivergenceModeWithType('AND');
        };

        // Create OR button
        const orButton = document.createElement('button');
        orButton.className = 'popup-button or-button';
        orButton.innerHTML = '<span style="font-size: 18px; margin-right: 8px;">⋁</span> OR';
        orButton.style.backgroundColor = '#2196f3';
        orButton.style.color = 'white';
        orButton.style.border = 'none';
        orButton.style.borderRadius = '4px';
        orButton.style.padding = '10px 20px';
        orButton.style.margin = '0 10px';
        orButton.style.cursor = 'pointer';
        orButton.style.fontWeight = 'bold';
        orButton.onclick = () => {
          usePopupStore.getState().hidePopup();
          startDivergenceModeWithType('OR');
        };

        // Create cancel button
        const cancelButton = document.createElement('button');
        cancelButton.className = 'popup-button cancel-button';
        cancelButton.textContent = 'Cancel';
        cancelButton.style.backgroundColor = 'transparent';
        cancelButton.style.color = '#666';
        cancelButton.style.border = '1px solid #ccc';
        cancelButton.style.borderRadius = '4px';
        cancelButton.style.padding = '10px 20px';
        cancelButton.style.margin = '0 10px';
        cancelButton.style.cursor = 'pointer';
        cancelButton.onclick = () => {
          usePopupStore.getState().hidePopup();
          cancelDivergenceMode();
        };

        // Add buttons to popup
        popupActions.appendChild(cancelButton);
        popupActions.appendChild(andButton);
        popupActions.appendChild(orButton);
      }
    }, 50);
  };

  // Start divergence mode with the selected type
  const startDivergenceModeWithType = (type: 'AND' | 'OR') => {
    setIsDivergenceMode(true);
    setDivergenceType(type);
    setHorizontalSteps([]);
    setVerticalSteps([]);
    setSelectedHorizontalStep(null);

    // Check if we have a pending position to select
    const pendingPosition = useEditorStore.getState()._pendingDivergencePosition;
    if (pendingPosition && positions[pendingPosition]) {
      // Add the pending position as a horizontal step
      addHorizontalStep(positions[pendingPosition], pendingPosition);
      // Clear the pending position
      useEditorStore.setState({ _pendingDivergencePosition: null });
    }
  };

  // Cancel divergence creation mode
  const cancelDivergenceMode = () => {
    setIsDivergenceMode(false);
    setHorizontalSteps([]);
    setVerticalSteps([]);
    setSelectedHorizontalStep(null);
    setDivergenceType(null);
  };

  // Add a horizontal step in divergence mode
  const addHorizontalStep = (position: Point, positionKey: string) => {
    // Check if this position is already selected
    const isAlreadySelected = horizontalSteps.some(hs => hs.key === positionKey);

    if (isAlreadySelected) {
      // If already selected, toggle selection for vertical suggestions
      if (selectedHorizontalStep === positionKey) {
        // If already selected, deselect it
        setSelectedHorizontalStep(null);
      } else {
        // Select this step for vertical suggestions
        setSelectedHorizontalStep(positionKey);
      }
      return;
    }

    // Add new horizontal step
    setHorizontalSteps(prev => [...prev, { position, key: positionKey }]);

    // Add a new suggestion in the same direction
    if (positionKey.startsWith('downRight')) {
      addRightDivergencePosition();
    } else if (positionKey.startsWith('downLeft')) {
      addLeftDivergencePosition();
    }
  };

  // Add a vertical step under a horizontal step
  const addVerticalStep = (parentKey: string, position: Point, positionKey: string) => {
    // Find if we already have vertical steps for this parent
    const existingIndex = verticalSteps.findIndex(vs => vs.parentKey === parentKey);

    if (existingIndex >= 0) {
      // Add to existing parent
      const updatedVerticalSteps = [...verticalSteps];
      updatedVerticalSteps[existingIndex].positions.push({ position, key: positionKey });
      setVerticalSteps(updatedVerticalSteps);
    } else {
      // Create new entry for this parent
      setVerticalSteps(prev => [...prev, {
        parentKey,
        positions: [{ position, key: positionKey }]
      }]);
    }
  };

  // Toggle selection of a divergence position
  const toggleDivergenceSelection = (positionKey: string) => {
    // If in divergence mode, handle differently
    if (isDivergenceMode) {
      const position = positions[positionKey];

      // Check if this is a horizontal selection (first level)
      if (positionKey.startsWith('down')) {
        addHorizontalStep(position, positionKey);
        return;
      }

      // Otherwise, handle as before
      setSelectedDivergencePositions(prev => {
        if (prev.includes(positionKey)) {
          return prev.filter(p => p !== positionKey);
        } else {
          return [...prev, positionKey];
        }
      });
      return;
    }

    // If this is the first divergence position selected, show the divergence type popup
    if (selectedDivergencePositions.length === 0 && !isDivergenceMode) {
      // Store the position key to select after the user chooses a divergence type
      startDivergenceMode(positionKey);
      return;
    }

    // Regular divergence selection (old behavior)
    setSelectedDivergencePositions(prev => {
      if (prev.includes(positionKey)) {
        return prev.filter(p => p !== positionKey);
      } else {
        return [...prev, positionKey];
      }
    });

    // When a divergence position is selected, add a new suggestion in the same direction
    if (positionKey.startsWith('downRight')) {
      addRightDivergencePosition();
    } else if (positionKey.startsWith('downLeft')) {
      addLeftDivergencePosition();
    }
  };

  // Check if a position is a divergence position
  const isDivergencePosition = (positionKey: string) => {
    // In divergence mode, treat 'down' as a divergence position too
    if (isDivergenceMode) {
      return positionKey.startsWith('down');
    }
    // In regular mode, only treat downLeft and downRight as divergence positions
    return positionKey.startsWith('down') && positionKey !== 'down';
  };

  // Check if a position is a vertical position
  const isVerticalPosition = (positionKey: string) => {
    return positionKey.startsWith('vertical_');
  };

  // Handle click on a position
  const handlePositionClick = (e: any, position: Point, positionKey: string) => {
    // Stop event propagation to prevent Canvas from handling the same click
    e.cancelBubble = true;

    // In divergence mode with a selected horizontal step, handle vertical positions
    if (isDivergenceMode && selectedHorizontalStep && isVerticalPosition(positionKey)) {
      // Add a vertical step under the selected horizontal step
      addVerticalStep(selectedHorizontalStep, position, positionKey);
      return;
    }

    // For divergence positions, toggle selection instead of immediately creating
    if (isDivergencePosition(positionKey)) {
      toggleDivergenceSelection(positionKey);
      return;
    }

    // For standard positions (up, left, right, down), create immediately
    createStep(position, positionKey);
  };

  // Create a step at the given position
  const createStep = (position: Point, _positionKey: string) => {
    // Create a new step at the selected position
    const newStep = addStep(position);

    // Create a transition in the middle of the connection between steps
    // Calculate the midpoint between the source step and the target step
    const sourceY = step.position.y + DEFAULT_STEP_SIZE.height;
    const targetY = newStep.position.y;
    const midY = sourceY + ((targetY - sourceY) / 2);

    const transitionPosition = {
      x: newStep.position.x + (DEFAULT_STEP_SIZE.width / 2) - (DEFAULT_TRANSITION_SIZE.width / 2),
      y: midY - (DEFAULT_TRANSITION_SIZE.height / 2)
    };

    // Create a transition
    const transition = addTransition(transitionPosition);

    // Create connections from source step to transition and from transition to target step
    // For regular steps, we don't set a divergence type
    addConnection(step.id, transition.id);
    addConnection(transition.id, newStep.id);

    // Update the last placed step and automatically select it to show new suggestions
    setLastPlacedStepId(newStep.id);
    useElementsStore.getState().selectElement(newStep.id);

    // Reset active steps to only include this new step
    setActiveSteps([newStep]);
  };

  // Create divergence with selected positions
  // Create divergence with selected positions
  const createDivergence = () => {
    // Handle advanced divergence mode
    if (isDivergenceMode) {
      if (horizontalSteps.length === 0) {
        return;
      }

      const createdSteps: Step[] = [];

      if (divergenceType === 'AND') {
        // AND Divergence: Step -> Transition -> Gate -> Steps

        // 1. Calculate the actual extent of the gate based on branch steps
        const stepSize = 'size' in step ? step.size : DEFAULT_STEP_SIZE;
        const sourceCenterX = step.position.x + stepSize.width / 2;

        const xPositions = horizontalSteps.map(hs => hs.position.x + DEFAULT_STEP_SIZE.width / 2);
        const minTipX = Math.min(...xPositions);
        const maxTipX = Math.max(...xPositions);

        // Final centerX for transition and gate is the source step center
        const centerX = sourceCenterX;

        // 2. Create one transition below the source step
        const transitionY = step.position.y + stepSize.height + 20;
        const transitionPos = {
          x: centerX - (DEFAULT_TRANSITION_SIZE.width / 2),
          y: transitionY
        };
        const transition = addTransition(transitionPos);

        // 3. Create AND gate immediately below transition
        // Sized to cover all tips and center, but NOT forced to be symmetrical
        const margin = 20;
        const gateLeft = Math.min(centerX, minTipX) - margin;
        const gateRight = Math.max(centerX, maxTipX) + margin;
        const gateWidth = gateRight - gateLeft;
        const gateY = transitionY + DEFAULT_TRANSITION_SIZE.height + 10;
        const gatePos = {
          x: gateLeft,
          y: gateY
        };
        const gate = addGate(gatePos, 'and-gate', 'divergence', horizontalSteps.length);
        useElementsStore.getState().updateElement(gate.id, { size: { width: gateWidth, height: DEFAULT_GATE_SIZE.height } });

        // 4. Connect source step -> transition -> gate
        addConnection(step.id, transition.id);
        addConnection(transition.id, gate.id);

        // 5. Create horizontal steps and connect gate -> steps
        const horizontalCreatedSteps = horizontalSteps.map(hs => {
          const newStep = addStep(hs.position);
          createdSteps.push(newStep);

          addConnection(gate.id, newStep.id);

          return { step: newStep, key: hs.key };
        });

        // 6. Create vertical steps under each horizontal step
        verticalSteps.forEach(vs => {
          const parentStep = horizontalCreatedSteps.find(hs => hs.key === vs.parentKey);
          if (!parentStep) return;

          vs.positions.forEach(pos => {
            const verticalStep = addStep(pos.position);
            createdSteps.push(verticalStep);

            const sourceY = parentStep.step.position.y + DEFAULT_STEP_SIZE.height;
            const targetY = pos.position.y;
            const midY = sourceY + ((targetY - sourceY) / 2);

            const transitionPosition = {
              x: pos.position.x + (DEFAULT_STEP_SIZE.width / 2) - (DEFAULT_TRANSITION_SIZE.width / 2),
              y: midY - (DEFAULT_TRANSITION_SIZE.height / 2)
            };

            const transition = addTransition(transitionPosition);

            addConnection(parentStep.step.id, transition.id);
            addConnection(transition.id, verticalStep.id);
          });
        });

      } else {
        // OR Divergence: Step -> (Transition -> Step) x N
        const horizontalCreatedSteps = horizontalSteps.map(hs => {
          const newStep = addStep(hs.position);
          createdSteps.push(newStep);

          const sourceY = step.position.y + DEFAULT_STEP_SIZE.height;
          const targetY = hs.position.y;
          const midY = sourceY + ((targetY - sourceY) / 2);

          const transitionPosition = {
            x: hs.position.x + (DEFAULT_STEP_SIZE.width / 2) - (DEFAULT_TRANSITION_SIZE.width / 2),
            y: midY - (DEFAULT_TRANSITION_SIZE.height / 2)
          };

          const transition = addTransition(transitionPosition);

          addConnection(step.id, transition.id);
          const conn2 = addConnection(transition.id, newStep.id);
          useElementsStore.getState().updateElement(conn2.id, { divergenceType: 'OR' });

          return { step: newStep, key: hs.key };
        });

        // Create vertical steps under each horizontal step
        verticalSteps.forEach(vs => {
          const parentStep = horizontalCreatedSteps.find(hs => hs.key === vs.parentKey);
          if (!parentStep) return;

          vs.positions.forEach(pos => {
            const verticalStep = addStep(pos.position);
            createdSteps.push(verticalStep);

            const sourceY = parentStep.step.position.y + DEFAULT_STEP_SIZE.height;
            const targetY = pos.position.y;
            const midY = sourceY + ((targetY - sourceY) / 2);

            const transitionPosition = {
              x: pos.position.x + (DEFAULT_STEP_SIZE.width / 2) - (DEFAULT_TRANSITION_SIZE.width / 2),
              y: midY - (DEFAULT_TRANSITION_SIZE.height / 2)
            };

            const transition = addTransition(transitionPosition);

            addConnection(parentStep.step.id, transition.id);
            addConnection(transition.id, verticalStep.id);
          });
        });
      }

      // Set all created steps as active for showing suggestions
      setActiveSteps(createdSteps);

      // Update the last placed step to the first one created and automatically select it
      if (createdSteps.length > 0) {
        setLastPlacedStepId(createdSteps[0].id);
        useElementsStore.getState().selectElement(createdSteps[0].id);
      }

      // Reset divergence mode
      setIsDivergenceMode(false);
      setHorizontalSteps([]);
      setVerticalSteps([]);

      // Reset divergence state
      resetDivergenceState();
      return;
    }

    // Handle simple divergence mode (original behavior)
    if (selectedDivergencePositions.length === 0) return;

    // Default to AND for simple mode
    const branchPositions = selectedDivergencePositions.map(pk => positions[pk]);

    // 1. Calculate horizontal bounds
    const xPositions = branchPositions.map(p => p.x);
    const minX = Math.min(...xPositions);
    const maxX = Math.max(...xPositions) + DEFAULT_STEP_SIZE.width;
    const centerX = minX + (maxX - minX) / 2;

    // 2. Create one transition
    const transitionY = step.position.y + DEFAULT_STEP_SIZE.height + 25;
    const transitionPos = {
      x: (step.position.x + DEFAULT_STEP_SIZE.width / 2) - (DEFAULT_TRANSITION_SIZE.width / 2),
      y: transitionY
    };
    const transition = addTransition(transitionPos);

    // 3. Create AND gate
    const gateWidth = Math.max(DEFAULT_GATE_SIZE.width, (maxX - minX) + 40);
    const gateY = transitionY + DEFAULT_TRANSITION_SIZE.height + 15;
    const gatePos = {
      x: centerX - gateWidth / 2,
      y: gateY
    };
    const gate = addGate(gatePos, 'and-gate', 'divergence', branchPositions.length);
    useElementsStore.getState().updateElement(gate.id, { size: { width: gateWidth, height: DEFAULT_GATE_SIZE.height } });

    // 4. Connect source step -> transition -> gate
    addConnection(step.id, transition.id);
    addConnection(transition.id, gate.id);

    // 5. Create steps and connect gate -> steps
    const newSteps = branchPositions.map(pos => {
      const newStep = addStep(pos);
      addConnection(gate.id, newStep.id);
      return newStep;
    });

    // Set all created steps as active for showing suggestions
    setActiveSteps(newSteps);

    // Update the last placed step to the first one created and automatically select it
    if (newSteps.length > 0) {
      setLastPlacedStepId(newSteps[0].id);
      useElementsStore.getState().selectElement(newSteps[0].id);
    }

    // Clear selections
    setSelectedDivergencePositions([]);

    // Reset divergence state
    resetDivergenceState();
  };

  // Reset divergence state to initial values
  const resetDivergenceState = () => {
    const alignmentX = getAlignmentX();
    const initialPositions: Record<string, Point> = {
      'down': {
        x: alignmentX,
        y: step.position.y + GUIDED_STEP_SPACING_VERTICAL
      },
      'downLeft1': {
        x: alignmentX - GUIDED_DIVERGENCE_SPACING,
        y: step.position.y + GUIDED_STEP_SPACING_VERTICAL
      },
      'downRight1': {
        x: alignmentX + GUIDED_DIVERGENCE_SPACING,
        y: step.position.y + GUIDED_STEP_SPACING_VERTICAL
      }
    };

    setDivergenceState({
      maxLeftIndex: 1,
      maxRightIndex: 1,
      positions: initialPositions
    });
  };

  // Create a closing connection back to the initial step
  const createClosingConnection = () => {
    // Find the initial step
    const initialStep = getInitialStep();
    if (!initialStep) {
      return;
    }

    // Create a transition below the current step
    const transitionPosition = {
      x: step.position.x + (DEFAULT_STEP_SIZE.width / 2) - (DEFAULT_TRANSITION_SIZE.width / 2),
      y: step.position.y + DEFAULT_STEP_SIZE.height + 30
    };

    // Create a transition with a unique number
    const transition = addTransition(transitionPosition);

    // Create a connection from the current step to the transition
    addConnection(step.id, transition.id);

    // Create a connection from the transition to the initial step
    const conn2 = addConnection(transition.id, initialStep.id);

    // Get the transition point for routing
    const transitionPoint = {
      x: transition.position.x + (DEFAULT_TRANSITION_SIZE.width / 2),
      y: transition.position.y
    };

    // Get all elements to calculate a safe distance for the connection
    const allElements = useElementsStore.getState().elements;

    // Find the leftmost position in the diagram to ensure our connection is to the left of everything
    const leftmostX = allElements.reduce((min, element) => {
      if (element.type === 'step' || element.type === 'transition') {
        return Math.min(min, element.position.x);
      }
      return min;
    }, initialStep.position.x);

    // Calculate a safe offset to the left (at least 100px to the left of the leftmost element)
    const safeLeftOffset = leftmostX - 100;

    // Calculate the path segments for the connection from transition to initial step
    // This creates the complex path: vertical down, horizontal left, vertical up, horizontal right, vertical down
    // Always routing on the left side of the diagram
    const segments = [
      // First vertical segment down from transition
      createConnectionSegment([
        { x: transitionPoint.x, y: transitionPoint.y + DEFAULT_TRANSITION_SIZE.height },
        { x: transitionPoint.x, y: transitionPoint.y + DEFAULT_TRANSITION_SIZE.height + 50 }
      ], 'vertical'),

      // First horizontal segment (always to the left)
      createConnectionSegment([
        { x: transitionPoint.x, y: transitionPoint.y + DEFAULT_TRANSITION_SIZE.height + 50 },
        { x: safeLeftOffset, y: transitionPoint.y + DEFAULT_TRANSITION_SIZE.height + 50 }
      ], 'horizontal'),

      // Second vertical segment (going up to above the initial step)
      createConnectionSegment([
        { x: safeLeftOffset, y: transitionPoint.y + DEFAULT_TRANSITION_SIZE.height + 50 },
        { x: safeLeftOffset, y: initialStep.position.y - 50 }
      ], 'vertical'),

      // Second horizontal segment (to align with the initial step)
      createConnectionSegment([
        { x: safeLeftOffset, y: initialStep.position.y - 50 },
        { x: initialStep.position.x + (DEFAULT_STEP_SIZE.width / 2), y: initialStep.position.y - 50 }
      ], 'horizontal'),

      // Final vertical segment down to the initial step
      createConnectionSegment([
        { x: initialStep.position.x + (DEFAULT_STEP_SIZE.width / 2), y: initialStep.position.y - 50 },
        { x: initialStep.position.x + (DEFAULT_STEP_SIZE.width / 2), y: initialStep.position.y }
      ], 'vertical')
    ];

    // Update the connection with the custom segments
    useElementsStore.getState().updateElement(conn2.id, { segments });

    // Update the last placed step
    setLastPlacedStepId(step.id);
    useElementsStore.getState().selectElement(step.id);
    // Guided mode is now mandatory, so no need to exit it

  };

  // Function to create closing connection back to initial step
  // Refactored to use robust detection instead of manual state
  const handleCloseDetectedDivergence = () => {
    if (!detectedOpenDivergence || !detectedOpenDivergence.isOpen || detectedOpenDivergence.branchTips.length === 0) return;

    const { type, branchTips, divergenceStart } = detectedOpenDivergence;
    if (!divergenceStart) return;

    // Use current store state for latest positions
    const elements = useElementsStore.getState().elements;

    // Safety check: ensure all tips still exist
    const currentTips = branchTips.map(t => elements.find(e => e.id === t.id)).filter(t => t) as GrafcetElement[];

    if (currentTips.length === 0) return;

    // Calculate convergence point (below the lowest tip)
    // For AND convergences, we bring it slightly closer (80px instead of 140px)
    const maxTipY = Math.max(...currentTips.map(t => t.position.y + ('size' in t ? t.size.height : 0)));
    const convergenceY = maxTipY + 80;

    // For OR: divergenceStart is the Step.
    // For AND: divergenceStart is the Gate. We need to find the Step BEFORE the Transition that leads to this Gate.
    let rootStep: GrafcetElement = divergenceStart;

    // Trace back to find the true source step for alignment
    if (divergenceStart.type === 'and-gate' || divergenceStart.type === 'or-gate') {
      const incomingToGate = elements.find(e => e.type === 'connection' && (e as any).targetId === divergenceStart.id);
      if (incomingToGate) {
        const sourceOfGate = elements.find(e => e.id === (incomingToGate as any).sourceId);
        if (sourceOfGate && sourceOfGate.type === 'transition') {
          const incomingToTrans = elements.find(e => e.type === 'connection' && (e as any).targetId === sourceOfGate.id);
          if (incomingToTrans) {
            const sourceStep = elements.find(e => e.id === (incomingToTrans as any).sourceId);
            if (sourceStep && sourceStep.type === 'step') {
              rootStep = sourceStep;
            }
          }
        } else if (sourceOfGate && sourceOfGate.type === 'step') {
          rootStep = sourceOfGate;
        }
      }
    }

    // X center aligns with the ROOT step of the divergence
    const rootSize = 'size' in rootStep ? rootStep.size : { width: 0, height: 0 };
    const centerX = rootStep.position.x + (rootSize.width / 2);

    // Adjust for default step width for the final step
    const convergenceStepX = centerX - (DEFAULT_STEP_SIZE.width / 2);

    let finalStep: Step;

    if (type === 'AND') {
      // AND Convergence: 
      // 1. Double horizontal line (Gate) - sized to cover all branched tips
      // 2. Single Transition
      // 3. Step

      const tipXPositions = currentTips.map(t => t.position.x + (('size' in t) ? t.size.width / 2 : 0));
      const minTipX = Math.min(...tipXPositions);
      const maxTipX = Math.max(...tipXPositions);

      // Sized to cover all tips and center, but NOT forced to be symmetrical
      const margin = 20;
      const gateLeft = Math.min(centerX, minTipX) - margin;
      const gateRight = Math.max(centerX, maxTipX) + margin;
      const gateWidth = gateRight - gateLeft;
      const gatePos = { x: gateLeft, y: convergenceY };

      const gate = useElementsStore.getState().addGate(gatePos, 'and-gate', 'convergence', currentTips.length);
      useElementsStore.getState().updateElement(gate.id, { size: { width: gateWidth, height: DEFAULT_GATE_SIZE.height } });

      // Connect tips to Gate (Connections will align vertically on the symmetrical bar)
      currentTips.forEach(tip => {
        addConnection(tip.id, gate.id);
      });

      // Add Transition after Gate
      const transPos = { x: centerX - (DEFAULT_TRANSITION_SIZE.width / 2), y: gatePos.y + DEFAULT_GATE_SIZE.height + 20 };
      const transition = addTransition(transPos);

      addConnection(gate.id, transition.id);

      // Add Step after Transition
      const stepPos = { x: convergenceStepX, y: transPos.y + DEFAULT_TRANSITION_SIZE.height + 20 };
      finalStep = addStep(stepPos);
      addConnection(transition.id, finalStep.id);

    } else { // OR
      // OR Convergence:
      // 1. Transition per branch
      // 2. Converge to single Step (Implicit OR)

      const transitions: Transition[] = [];
      const transY = maxTipY + 30; // A bit below tips

      currentTips.forEach(tip => {
        // Create transition below each tip
        const tipX = tip.position.x + (('size' in tip ? tip.size.width : 0) / 2) - (DEFAULT_TRANSITION_SIZE.width / 2);
        const tPos = { x: tipX, y: transY };
        const trans = addTransition(tPos);

        addConnection(tip.id, trans.id);
        transitions.push(trans);
      });

      // Create convergence Step
      // Position it below the transitions
      const stepPos = { x: convergenceStepX, y: transY + DEFAULT_TRANSITION_SIZE.height + 40 };
      finalStep = addStep(stepPos);

      // Connect all transitions to the final step
      transitions.forEach(trans => {
        const conn = addConnection(trans.id, finalStep.id);
        useElementsStore.getState().updateElement(conn.id, { divergenceType: 'OR' });
      });
    }

    setLastPlacedStepId(finalStep.id);
    useElementsStore.getState().selectElement(finalStep.id);

    // We don't use toggleGuidedMode(false) here because we might want to continue adding steps
    // But usually closing a divergence is a significant action, so keeping it or resetting it is fine.
    // Let's reset the active steps to the new one
    setActiveSteps([finalStep]);

    // Reset detected state
    setDetectedOpenDivergence(null);
  };

  // Delete the detected divergence structure recursively
  const handleDeleteDivergence = () => {
    if (!detectedOpenDivergence || !detectedOpenDivergence.divergenceStart) return;

    const { divergenceStart, type } = detectedOpenDivergence;
    const elements = useElementsStore.getState().elements;

    // We need to delete everything starting from the divergenceStart 
    // AND all the branches, recursively until we hit tips or open ends.
    // Ideally, we delete the divergenceStart + all outgoing connections + all children in those branches.

    // Set of IDs to delete
    let anchorStepId: string | null = null;
    const idsToDelete = new Set<string>();

    if (type === 'OR') {
      // OR Divergence: Step (Start) -> Connections -> Transitions
      // The `divergenceStart` IS the Step.
      // We must KEEP the Step but restart its state.
      anchorStepId = divergenceStart.id;

      // We start deleting from the outgoing connections of this step
      // The step itself is NOT added to idsToDelete.
      const outgoing = elements.filter(e => e.type === 'connection' && (e as any).sourceId === divergenceStart.id);
      outgoing.forEach(e => idsToDelete.add(e.id));

      // The targets of these connections (Transitions) are the roots of the branches to delete
      const branchRoots = outgoing.map(conn =>
        elements.find(e => e.id === (conn as any).targetId)
      ).filter(e => e);

      branchRoots.forEach(root => {
        if (root) idsToDelete.add(root.id);
      });
    } else {
      // AND Divergence: Gate (Start) -> ...
      // The `divergenceStart` IS the Gate.
      // We DELETE the Gate.
      idsToDelete.add(divergenceStart.id);

      // Find incoming connection to find the Anchor Step (Reference Step)
      const incoming = elements.filter(e => e.type === 'connection' && (e as any).targetId === divergenceStart.id);
      incoming.forEach(conn => {
        idsToDelete.add(conn.id); // Delete the connection to the gate
        if ((conn as any).sourceId) {
          anchorStepId = (conn as any).sourceId;
        }
      });
    }

    // BFS search to find all downstream elements in the branches
    // We initialize queue with elements we've already marked for deletion (except connections)
    // For OR: Transitions. For AND: Gate.
    const queue: string[] = [];

    if (type === 'OR') {
      const outgoing = elements.filter(e => e.type === 'connection' && (e as any).sourceId === divergenceStart.id);
      outgoing.forEach(conn => {
        if ((conn as any).targetId) queue.push((conn as any).targetId);
      });
    } else {
      queue.push(divergenceStart.id);
    }

    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      idsToDelete.add(currentId);

      // Find outgoing connections from this element
      const outgoingConnections = elements.filter(
        e => e.type === 'connection' && (e as any).sourceId === currentId
      );

      outgoingConnections.forEach(conn => {
        idsToDelete.add(conn.id);
        const targetId = (conn as any).targetId;

        // Check if target is part of the branch
        // We assume anything connected downwards is part of the branch
        // Safety check to ensure we don't accidentally traverse BACK to the anchor (shouldn't happen in DAG but safe)
        if (targetId && !visited.has(targetId) && targetId !== anchorStepId) {
          queue.push(targetId);
        }
      });
    }

    // Execute deletion
    useElementsStore.getState().selectElements([]); // Deselect all to prevent ghost selections

    Array.from(idsToDelete).forEach(id => {
      useElementsStore.getState().deleteElement(id);
    });

    // Restore state to "start building again"
    if (anchorStepId) {
      const anchorStep = elements.find(e => e.id === anchorStepId) as Step;
      // Only restore if the element still exists (it should, we preserved it) and is a Step
      if (anchorStep && anchorStep.type === 'step') {
        // Select the anchor step
        useElementsStore.getState().selectElement(anchorStepId);
        // Set it as active so guided buttons appear immediately
        setActiveSteps([anchorStep]);
        // Reset other states
        setLastPlacedStepId(anchorStepId);
      }
    }

    // Reset detected state locally
    setDetectedOpenDivergence(null);
  };

  // Render connection lines for a position - now empty as we don't want to show connections
  const renderConnectionLine = (_positionKey: string) => {
    // Return null to not render any connection lines
    return null;
  };

  // Render visual indicators for advanced divergence mode
  const renderAdvancedDivergenceIndicators = () => {
    if (!isDivergenceMode || horizontalSteps.length === 0) return null;

    // Different colors based on divergence type
    const typeColor = divergenceType === 'AND' ? "#4caf50" : "#2196f3";

    return (
      <Group>
        {/* Show the selected horizontal steps */}
        {horizontalSteps.map((hs, index) => {
          const isSelected = selectedHorizontalStep === hs.key;
          return (
            <Rect
              key={`horiz-${index}`}
              x={hs.position.x}
              y={hs.position.y}
              width={DEFAULT_STEP_SIZE.width}
              height={DEFAULT_STEP_SIZE.height}
              stroke={isSelected ? "#ff5722" : typeColor} // Highlight selected step
              strokeWidth={isSelected ? 3 : 2}
              dash={isSelected ? [] : [5, 5]} // Solid line for selected
              fill={isSelected ? "rgba(255, 87, 34, 0.2)" : divergenceType === 'AND' ? "rgba(76, 175, 80, 0.1)" : "rgba(33, 150, 243, 0.1)"}
              opacity={0.8}
              cornerRadius={4}
            />
          );
        })}

        {/* Show the vertical steps under each horizontal step */}
        {verticalSteps.map((vs, parentIndex) =>
          vs.positions.map((pos, childIndex) => (
            <Rect
              key={`vert-${parentIndex}-${childIndex}`}
              x={pos.position.x}
              y={pos.position.y}
              width={DEFAULT_STEP_SIZE.width}
              height={DEFAULT_STEP_SIZE.height}
              stroke="#ff9800"
              strokeWidth={2}
              dash={[5, 5]}
              fill="rgba(255, 152, 0, 0.1)"
              opacity={0.8}
              cornerRadius={4}
            />
          ))
        )}

        {/* Show a vertical guide line below the selected horizontal step */}
        {selectedHorizontalStep && (() => {
          const selectedStep = horizontalSteps.find(hs => hs.key === selectedHorizontalStep);
          if (!selectedStep) return null;

          return (
            <Rect
              x={selectedStep.position.x + DEFAULT_STEP_SIZE.width / 2 - 1}
              y={selectedStep.position.y + DEFAULT_STEP_SIZE.height}
              width={2}
              height={GUIDED_STEP_SPACING_VERTICAL}
              fill="#ff5722"
              opacity={0.6}
              dash={[5, 5]}
            />
          );
        })()}
      </Group>
    );
  };

  // Removed renderDivergenceStepIndicators
  const renderDivergenceStepIndicators = () => null;





  // Render suggestions for multiple active steps
  const renderMultiStepSuggestions = () => {
    if (activeSteps.length <= 1) return null; // Use regular rendering for 0 or 1 step

    return (
      <Group>
        {activeSteps.map(activeStep => {
          // Calculate positions for this step
          const stepPositions = {
            down: {
              x: activeStep.position.x,
              y: activeStep.position.y + GUIDED_STEP_SPACING_VERTICAL
            }
          };

          // Render a suggestion below this step
          const position = stepPositions.down;
          const posKey = `down_${activeStep.id}`;

          return (
            <Group key={`suggestion-${activeStep.id}`}>
              {/* Visual indicator connecting the step to its suggestion */}
              <Rect
                x={activeStep.position.x + DEFAULT_STEP_SIZE.width / 2 - 1}
                y={activeStep.position.y + DEFAULT_STEP_SIZE.height}
                width={2}
                height={GUIDED_STEP_SPACING_VERTICAL - DEFAULT_STEP_SIZE.height}
                fill="#673ab7"
                opacity={0.4}
                dash={[5, 5]}
              />

              {/* The suggestion position */}
              <Group
                x={position.x}
                y={position.y}
                onMouseEnter={() => setHoveredPosition(posKey)}
                onMouseLeave={() => setHoveredPosition(null)}
                onClick={(e) => {
                  e.cancelBubble = true;
                  // Create a new step at this position
                  const newStep = addStep(position);

                  // Calculate the true midpoint between the active step and the new step
                  const sourceY = activeStep.position.y + DEFAULT_STEP_SIZE.height;
                  const targetY = newStep.position.y;
                  const midY = sourceY + ((targetY - sourceY) / 2);

                  // Create a transition centered at the midpoint
                  const transitionPosition = {
                    x: newStep.position.x + (DEFAULT_STEP_SIZE.width / 2) - (DEFAULT_TRANSITION_SIZE.width / 2),
                    y: midY - (DEFAULT_TRANSITION_SIZE.height / 2)
                  };

                  // Create a transition
                  const transition = addTransition(transitionPosition);

                  // Create connections from source step to transition and from transition to target step
                  addConnection(activeStep.id, transition.id);
                  addConnection(transition.id, newStep.id);

                  // Update the last placed step
                  setLastPlacedStepId(newStep.id);
                  useElementsStore.getState().selectElement(newStep.id);

                  // Remove this step from active steps and add the new one
                  setActiveSteps(prev => prev.filter(s => s.id !== activeStep.id).concat([newStep]));
                }}
              >
                {/* Enhanced step suggestion with better visibility */}
                <Rect
                  width={DEFAULT_STEP_SIZE.width * 2}
                  height={DEFAULT_STEP_SIZE.height}
                  stroke="#673ab7"
                  strokeWidth={2}
                  dash={[]}
                  fill="rgba(103, 58, 183, 0.2)"
                  opacity={1}
                  cornerRadius={6}
                />

                <Group x={0} y={0}>
                  <Circle
                    x={DEFAULT_STEP_SIZE.width / 2}
                    y={DEFAULT_STEP_SIZE.height / 2}
                    radius={15}
                    fill="#673ab7"
                    opacity={0.9}
                  />

                  <Text
                    x={0}
                    y={0}
                    width={DEFAULT_STEP_SIZE.width}
                    height={DEFAULT_STEP_SIZE.height}
                    text="+"
                    fontSize={20}
                    fontStyle="bold"
                    fill="white"
                    align="center"
                    verticalAlign="middle"
                  />
                </Group>

                <Text
                  x={DEFAULT_STEP_SIZE.width}
                  y={0}
                  width={DEFAULT_STEP_SIZE.width}
                  height={DEFAULT_STEP_SIZE.height}
                  text="Add Step"
                  fontSize={12}
                  fontStyle="bold"
                  fill="#673ab7"
                  align="center"
                  verticalAlign="middle"
                />

                {/* Enhanced label with better description */}
                <Text
                  x={-20}
                  y={DEFAULT_STEP_SIZE.height + 5}
                  width={DEFAULT_STEP_SIZE.width * 2 + 40}
                  text={`▼ Add step below STEP ${activeStep.number}`}
                  fontSize={11}
                  fontStyle="bold"
                  fill="#673ab7"
                  align="center"
                />
              </Group>
            </Group>
          );
        })}
      </Group>
    );
  };

  // Render the "Close SFC" button near the initial step
  const renderCloseGrafcetButton = () => {
    // Only show this button if the current step is not the initial step
    if (step.stepType === 'initial') return null;

    // Find the initial step
    const initialStep = getInitialStep();
    if (!initialStep) return null;

    return (
      <AnimatedButton
        x={initialStep.position.x - DEFAULT_STEP_SIZE.width * 3 - 10}  // Position to the left of the initial step with spacing
        y={initialStep.position.y}
        width={DEFAULT_STEP_SIZE.width * 3}
        height={DEFAULT_STEP_SIZE.height}
        text="Close SFC"
        icon="⟲"
        fontSize={14}
        fill="#673ab7"
        hoverFill="#9575cd"
        onClick={createClosingConnection}
      />
    );
  };

  return (
    <Group>
      {/* Connection lines to show the possible paths */}
      {Object.keys(positions).map(posKey => renderConnectionLine(posKey))}

      {/* Render advanced divergence indicators */}
      {renderAdvancedDivergenceIndicators()}

      {/* Render divergence step indicators */}
      {renderDivergenceStepIndicators()}

      {/* Render suggestions for multiple active steps */}
      {renderMultiStepSuggestions()}

      {/* Render the Close SFC button */}
      {renderCloseGrafcetButton()}

      {/* Divergence Build Button - positioned very close to the step to quickly start divergence mode */}
      {activeSteps.length <= 1 && Object.keys(positions).some(posKey => isDivergencePosition(posKey)) && !isDivergenceMode && selectedDivergencePositions.length === 0 && (
        <Group>
          <Group
            onMouseEnter={() => setHoveredPosition('divergence-button')}
            onMouseLeave={() => setHoveredPosition(null)}
          >
            <AnimatedButton
              x={step.position.x + DEFAULT_STEP_SIZE.width + 5}
              y={step.position.y}
              width={DEFAULT_STEP_SIZE.width * 3}
              height={DEFAULT_STEP_SIZE.height}
              text="Create Divergence"
              icon="⊢"
              fontSize={14}
              fill="#1976d2"
              hoverFill="#42a5f5"
              onClick={() => startDivergenceMode()}
            />
          </Group>

          {/* We don't need a tooltip anymore since the button has descriptive text */}
        </Group>
      )}

      {/* Render position indicators with enhanced styling and animations - only if not showing multi-step suggestions */}
      {activeSteps.length <= 1 && Object.keys(positions).map(posKey => {
        const position = positions[posKey];
        const isHovered = hoveredPosition === posKey;
        const isSelected = selectedDivergencePositions.includes(posKey);
        const isDivergence = isDivergencePosition(posKey);

        // Enhanced colors for better visual feedback
        const baseColor = isDivergence
          ? (divergenceType === 'AND' ? '#4caf50' : '#2196f3')
          : '#673ab7';

        // Determine colors and styles based on state
        const strokeColor = isHovered || isSelected
          ? baseColor
          : 'rgba(100, 100, 100, 0.6)';

        const fillColor = isHovered || isSelected
          ? `${baseColor}20` // 20% opacity
          : 'rgba(240, 240, 240, 0.05)';

        const textColor = isHovered || isSelected
          ? baseColor
          : 'rgba(80, 80, 80, 0.8)';

        // For selected divergence positions, use a different style
        const strokeStyle = isSelected ? [] : [5, 5]; // Solid line for selected
        const strokeWidth = isSelected ? 3 : isHovered ? 2.5 : 1.5;
        const opacity = isHovered ? 1 : 0.9;

        // Scale effect for hover
        const scale = isHovered ? 1.05 : 1;

        // Generate position label with improved naming
        let label = posKey.toUpperCase();
        let icon = '';

        if (posKey.startsWith('downLeft')) {
          const num = posKey.replace('downLeft', '');
          label = `L${num}`;
          icon = '◄';
        } else if (posKey.startsWith('downRight')) {
          const num = posKey.replace('downRight', '');
          label = `R${num}`;
          icon = '►';
        } else if (posKey === 'down') {
          label = 'DOWN';
          icon = '▼';
        } else if (posKey.startsWith('vertical_')) {
          label = 'BELOW';
          icon = '▼';
        }

        // Position the label based on position type
        let labelX = 0;
        let labelY = 0;
        let labelWidth = DEFAULT_STEP_SIZE.width;

        // Only handle down and divergence positions
        if (posKey === 'down' || posKey.startsWith('downLeft') || posKey.startsWith('downRight')) {
          labelY = DEFAULT_STEP_SIZE.height + 5;
          labelWidth = 80;
          labelX = -20;
        }

        // Determine if this position is part of a horizontal step in divergence mode
        const isHorizontalStep = horizontalSteps.some(hs => hs.key === posKey);
        const isSelectedHorizontal = selectedHorizontalStep === posKey;

        // Special styling for horizontal steps in divergence mode
        if (isDivergenceMode && isHorizontalStep) {
          const highlightColor = isSelectedHorizontal ? '#ff5722' : (divergenceType === 'AND' ? '#4caf50' : '#2196f3');

          return (
            <Group
              key={`pos-${posKey}`}
              x={position.x}
              y={position.y}
              scaleX={isSelectedHorizontal ? 1.1 : 1}
              scaleY={isSelectedHorizontal ? 1.1 : 1}
              onMouseEnter={() => setHoveredPosition(posKey)}
              onMouseLeave={() => setHoveredPosition(null)}
              onClick={(e) => handlePositionClick(e, position, posKey)}
            >
              {/* Enhanced horizontal step indicator with better visibility */}
              <Rect
                width={DEFAULT_STEP_SIZE.width * 2}
                height={DEFAULT_STEP_SIZE.height}
                stroke={highlightColor}
                strokeWidth={3}
                dash={isSelectedHorizontal ? [] : [5, 5]}
                fill={`${highlightColor}20`}
                opacity={1}
                cornerRadius={6}
                shadowColor={highlightColor}
                shadowBlur={isSelectedHorizontal ? 10 : 0}
                shadowOpacity={0.5}
              />

              <Group x={0} y={0}>
                <Circle
                  x={DEFAULT_STEP_SIZE.width / 2}
                  y={DEFAULT_STEP_SIZE.height / 2}
                  radius={15}
                  fill={highlightColor}
                  opacity={0.8}
                />
                <Text
                  x={0}
                  y={0}
                  width={DEFAULT_STEP_SIZE.width}
                  height={DEFAULT_STEP_SIZE.height}
                  text={isSelectedHorizontal ? "✓" : "+"}
                  fontSize={18}
                  fontStyle="bold"
                  fill="white"
                  align="center"
                  verticalAlign="middle"
                />
              </Group>

              {/* Add descriptive text */}
              <Text
                x={DEFAULT_STEP_SIZE.width}
                y={0}
                width={DEFAULT_STEP_SIZE.width}
                height={DEFAULT_STEP_SIZE.height}
                text={isSelectedHorizontal ? "Selected" : "Select"}
                fontSize={12}
                fontStyle="bold"
                fill={highlightColor}
                align="center"
                verticalAlign="middle"
              />
              <Text
                x={labelX}
                y={labelY}
                width={labelWidth}
                text={`${icon} ${label}`}
                fontSize={12}
                fontStyle="bold"
                fill={highlightColor}
                align="center"
              />
            </Group>
          );
        }

        return (
          <Group
            key={`pos-${posKey}`}
            x={position.x}
            y={position.y}
            scaleX={scale}
            scaleY={scale}
            onMouseEnter={() => setHoveredPosition(posKey)}
            onMouseLeave={() => setHoveredPosition(null)}
            onClick={(e) => handlePositionClick(e, position, posKey)}
          >
            {/* Pulsing effect for hover */}
            {isHovered && (
              <Circle
                x={DEFAULT_STEP_SIZE.width / 2}
                y={DEFAULT_STEP_SIZE.height / 2}
                radius={30}
                fill={`${baseColor}10`}
                opacity={0.5}
              />
            )}

            {/* Enhanced position indicator with better visibility */}
            <Rect
              width={DEFAULT_STEP_SIZE.width * 2}
              height={DEFAULT_STEP_SIZE.height}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              dash={strokeStyle}
              fill={fillColor}
              opacity={opacity}
              cornerRadius={6}
              shadowColor={isHovered ? baseColor : undefined}
              shadowBlur={isHovered ? 8 : 0}
              shadowOpacity={0.3}
            />

            <Group x={0} y={0}>
              <Circle
                x={DEFAULT_STEP_SIZE.width / 2}
                y={DEFAULT_STEP_SIZE.height / 2}
                radius={isHovered ? 15 : 12}
                fill={strokeColor}
                opacity={isHovered ? 0.9 : 0.7}
              />

              {/* Always show the plus sign for better visibility */}
              <Text
                x={0}
                y={0}
                width={DEFAULT_STEP_SIZE.width}
                height={DEFAULT_STEP_SIZE.height}
                text="+"
                fontSize={isHovered ? 18 : 16}
                fontStyle="bold"
                fill="white"
                align="center"
                verticalAlign="middle"
              />
            </Group>

            {/* Add descriptive text */}
            <Text
              x={DEFAULT_STEP_SIZE.width}
              y={0}
              width={DEFAULT_STEP_SIZE.width}
              height={DEFAULT_STEP_SIZE.height}
              text={isDivergence ? "Divergence" : "Add Step"}
              fontSize={12}
              fontStyle="bold"
              fill={textColor}
              align="center"
              verticalAlign="middle"
            />

            <Text
              x={labelX}
              y={labelY}
              width={labelWidth}
              text={`${icon} ${label}`}
              fontSize={isDivergence ? 12 : 14}
              fontStyle="bold"
              fill={textColor}
              align="center"
            />

            {/* Tooltip for better UX */}
            {isHovered && (
              <Group
                y={-40}
              >
                <Rect
                  x={-60}
                  width={160}
                  height={30}
                  fill="rgba(0, 0, 0, 0.7)"
                  cornerRadius={4}
                  opacity={0.9}
                />
                <Text
                  x={-60}
                  width={160}
                  height={30}
                  text={posKey === 'down' ?
                    `Click to add step below` :
                    `Click to add divergence step`}
                  fontSize={11}
                  fill="white"
                  align="center"
                  verticalAlign="middle"
                />
              </Group>
            )}
          </Group>
        );
      })}



      {/* Advanced Divergence Mode UI */}
      {/* Advanced Divergence Mode UI - Unified Menu */}
      {isDivergenceMode && (
        <DivergenceCreationMenu
          type={divergenceType}
          x={step.position.x - 150} // Position to left
          y={step.position.y}
          count={horizontalSteps.length}
          onCreate={createDivergence}
          onCancel={cancelDivergenceMode}
        />
      )}

      {/* Simple Divergence Mode UI */}
      {!isDivergenceMode && selectedDivergencePositions.length > 0 && (
        <AnimatedButton
          x={step.position.x - DEFAULT_STEP_SIZE.width}
          y={step.position.y + GUIDED_STEP_SPACING_VERTICAL + DEFAULT_STEP_SIZE.height}
          width={DEFAULT_STEP_SIZE.width * 4}
          height={DEFAULT_STEP_SIZE.height}
          text={`Create Divergence (${selectedDivergencePositions.length})`}
          icon="⊢"
          fontSize={14}
          fill="#1976d2"
          hoverFill="#42a5f5"
          onClick={createDivergence}
        />
      )}


      {/* Existing buttons */}
      {/* Existing buttons */}
      {!isDivergenceMode && Object.entries(positions).map(([key, _position]) => {
        // ... existing button mapping ...
        if (key !== 'down' && !key.startsWith('down')) return null; // Simplified view for now
        // Actually, we rely on the parent map.
        // Let's insert our Close Button here if needed, or simply render it separately.
        return null;
      })}

      {/* Render standard guided positions (existing logic preserved via fallback or explicit loop if I didn't cut it) */}
      {/* Note: I am not replacing the main render logic, just adding the Close Button below */}
      {detectedOpenDivergence && detectedOpenDivergence.isOpen && detectedOpenDivergence.divergenceStart && (() => {
        // Determine the Anchor Position (Reference Step) for the menu
        // For OR: It's the divergenceStart itself.
        // For AND: It's the step BEFORE the divergenceStart (gate).

        let anchorElement = detectedOpenDivergence.divergenceStart;

        if (detectedOpenDivergence.type === 'AND') {
          // Find the element connected TO this gate
          const elements = useElementsStore.getState().elements;
          const incoming = elements.find(e => e.type === 'connection' && (e as any).targetId === anchorElement.id);
          if (incoming && (incoming as any).sourceId) {
            const source = elements.find(e => e.id === (incoming as any).sourceId);
            if (source) anchorElement = source as any;
          }
        }

        return (
          <DivergenceActionMenu
            type={detectedOpenDivergence.type}
            // Position to the LEFT of the ANCHOR element
            x={anchorElement.position.x - 130}
            y={anchorElement.position.y}
            title={('number' in anchorElement) ? `Divergence on ${anchorElement.number}` : 'Divergence'}
            onClose={handleCloseDetectedDivergence}
            onDelete={handleDeleteDivergence}
          />
        );
      })()}
    </Group>
  );
};

export default GuidedPositions;
