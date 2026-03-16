import React from 'react';
import { Group, Rect, Text, Circle } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useGsrsmStore } from '../../store/useGsrsmStore';
import { usePopupStore } from '../../store/usePopupStore';
import {
  Gsrsm_MODE_TITLE_FONT_SIZE,
  Gsrsm_MODE_CODE_FONT_SIZE,
  Gsrsm_A1_SIZE,
  Gsrsm_A2_SIZE,
  Gsrsm_A3_SIZE,
  Gsrsm_A4_SIZE,
  Gsrsm_A5_SIZE,
  Gsrsm_A6_SIZE,
  Gsrsm_A7_SIZE,
  Gsrsm_D1_SIZE,
  Gsrsm_D2_SIZE,
  Gsrsm_D3_SIZE,
  Gsrsm_F1_SIZE,
  Gsrsm_F2_SIZE,
  Gsrsm_F3_SIZE,
  Gsrsm_F4_SIZE,
  Gsrsm_F5_SIZE,
  Gsrsm_F6_SIZE,
  Gsrsm_VERTICAL_SPACING,
  Gsrsm_HEADER_HEIGHT
} from '../../models/constants';

interface GsrsmModesProps {
  x: number;
  y: number;
  width: number;
  height: number;
  sectionPositions: {
    A: { x: number; y: number; width: number; height: number };
    D: { x: number; y: number; width: number; height: number };
    F: { x: number; y: number; width: number; height: number };
  };
}

const GsrsmModes: React.FC<GsrsmModesProps> = ({ sectionPositions }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();

  // Define common spacing values
  const verticalGutter = Gsrsm_VERTICAL_SPACING;

  // Calculate positions for all modes based on the absolute reference
  const positions = {
    // A modes (Procédures d'Arrêt)
    A: {
      A1: {
        x: sectionPositions.A.x + sectionPositions.A.width - Gsrsm_A1_SIZE.width - 20,
        y: sectionPositions.A.y + Gsrsm_HEADER_HEIGHT + 30,
        width: Gsrsm_A1_SIZE.width,
        height: Gsrsm_A1_SIZE.height,
        doubleStroke: true
      },
      A2: {
        x: sectionPositions.A.x + sectionPositions.A.width - Gsrsm_A2_SIZE.width - 20 - Gsrsm_A3_SIZE.width - 10,
        y: sectionPositions.A.y + Gsrsm_HEADER_HEIGHT + 30 + Gsrsm_A6_SIZE.height + Gsrsm_A7_SIZE.height + 2 * verticalGutter + 15,
        width: Gsrsm_A2_SIZE.width,
        height: Gsrsm_A2_SIZE.height
      },
      A3: {
        x: sectionPositions.A.x + sectionPositions.A.width - Gsrsm_A3_SIZE.width - 20,
        y: sectionPositions.A.y + Gsrsm_HEADER_HEIGHT + 30 + Gsrsm_A6_SIZE.height + Gsrsm_A7_SIZE.height + 2 * verticalGutter + 15,
        width: Gsrsm_A3_SIZE.width,
        height: Gsrsm_A3_SIZE.height
      },
      A4: {
        x: sectionPositions.A.x + sectionPositions.A.width - Gsrsm_A4_SIZE.width - 20,
        y: sectionPositions.A.y + Gsrsm_HEADER_HEIGHT + 30 + Gsrsm_A1_SIZE.height + verticalGutter,
        width: Gsrsm_A4_SIZE.width,
        height: Gsrsm_A4_SIZE.height
      },
      A5: {
        x: sectionPositions.A.x + 20,
        y: sectionPositions.A.y + Gsrsm_HEADER_HEIGHT + 30 + Gsrsm_A6_SIZE.height + Gsrsm_A7_SIZE.height + 2 * verticalGutter + 15,
        width: Gsrsm_A5_SIZE.width,
        height: Gsrsm_A5_SIZE.height
      },
      A6: {
        x: sectionPositions.A.x + 20,
        y: sectionPositions.A.y + Gsrsm_HEADER_HEIGHT + 30,
        width: Gsrsm_A6_SIZE.width,
        height: Gsrsm_A6_SIZE.height
      },
      A7: {
        x: sectionPositions.A.x + Gsrsm_A6_SIZE.width - Gsrsm_A7_SIZE.width + 20,
        y: sectionPositions.A.y + Gsrsm_HEADER_HEIGHT + 30 + Gsrsm_A6_SIZE.height + verticalGutter,
        width: Gsrsm_A7_SIZE.width,
        height: Gsrsm_A7_SIZE.height
      }
    },

    // D modes (Procédures de Défaillance)
    D: {
      D1: {
        x: sectionPositions.D.x + 20,
        y: sectionPositions.D.y + Gsrsm_HEADER_HEIGHT + sectionPositions.D.height / 2 - Gsrsm_D1_SIZE.height / 2 + 40,
        width: sectionPositions.D.width - 40,
        height: Gsrsm_D1_SIZE.height
      },
      D2: {
        x: sectionPositions.A.x + 20 + Gsrsm_A5_SIZE.width - Gsrsm_D2_SIZE.width,
        y: sectionPositions.D.y + Gsrsm_HEADER_HEIGHT + 20,
        width: Gsrsm_D2_SIZE.width,
        height: Gsrsm_D2_SIZE.height
      },
      D3: {
        x: sectionPositions.A.x + sectionPositions.A.width - Gsrsm_A2_SIZE.width - 20 - Gsrsm_A3_SIZE.width - 10,
        y: sectionPositions.D.y + Gsrsm_HEADER_HEIGHT + 20,
        width: Gsrsm_A2_SIZE.width + 10 + Gsrsm_A3_SIZE.width,
        height: Gsrsm_D3_SIZE.height
      }
    },

    // F modes (Procédures de Fonctionnement)
    F: {
      F1: {
        x: sectionPositions.F.x + sectionPositions.F.width / 3 - Gsrsm_F1_SIZE.width / 2,
        y: sectionPositions.F.y + Gsrsm_HEADER_HEIGHT + sectionPositions.F.height / 3 + 40,
        width: Gsrsm_F1_SIZE.width,
        height: Gsrsm_F1_SIZE.height,
        boldBorder: true
      },
      F2: {
        x: sectionPositions.F.x + sectionPositions.F.width / 4 - Gsrsm_F2_SIZE.width / 2,
        y: sectionPositions.F.y + Gsrsm_HEADER_HEIGHT + 90,
        width: Gsrsm_F2_SIZE.width,
        height: Gsrsm_F2_SIZE.height
      },
      F3: {
        x: sectionPositions.F.x + sectionPositions.F.width / 2 - Gsrsm_F3_SIZE.width / 2,
        y: sectionPositions.F.y + Gsrsm_HEADER_HEIGHT + 90,
        width: Gsrsm_F3_SIZE.width,
        height: Gsrsm_F3_SIZE.height
      },
      F4: {
        x: sectionPositions.F.x + 4.2 * sectionPositions.F.width / 5 - Gsrsm_F4_SIZE.width / 2,
        y: sectionPositions.F.y + Gsrsm_HEADER_HEIGHT + 90 - Gsrsm_F4_SIZE.height,
        width: Gsrsm_F4_SIZE.width,
        height: Gsrsm_F4_SIZE.height
      },
      F5: {
        x: sectionPositions.F.x + 4.2 * sectionPositions.F.width / 5 - Gsrsm_F5_SIZE.width / 2,
        y: sectionPositions.F.y + Gsrsm_HEADER_HEIGHT + 120,
        width: Gsrsm_F5_SIZE.width,
        height: Gsrsm_F5_SIZE.height
      },
      F6: {
        x: sectionPositions.F.x + 4.2 * sectionPositions.F.width / 5 - Gsrsm_F6_SIZE.width / 2,
        y: sectionPositions.F.y + Gsrsm_HEADER_HEIGHT + 120 + Gsrsm_F5_SIZE.height + 20,
        width: Gsrsm_F6_SIZE.width,
        height: Gsrsm_F6_SIZE.height
      }
    }
  };

  // Get colors based on theme
  const getTextColor = () => {
    return theme.text;
  };

  const getBorderColor = () => {
    return theme.border;
  };

  // Get all modes from the store and activation functions
  const {
    project,
    activateMode,
    deactivateMode,
    showContextMenu
  } = useGsrsmStore();
  const { showPopup } = usePopupStore();
  const modes = project?.diagram?.modes || [];

  // Handle mode click
  const handleModeClick = (modeId: string | undefined, code: string) => {
    if (modeId) {
      const mode = modes.find(m => m.id === modeId);
      const isActive = mode?.type === 'active';

      if (isActive) {
        // Show confirmation popup when clicking an active mode
        usePopupStore.getState().showConfirm(
          t('COMMON.CONFIRM_DEACTIVATE_TITLE') || 'Deactivate Mode',
          `Are you sure you want to deactivate mode ${code}? This mode has an associated folder.${'\n\n'}You can choose to keep the folder or delete it along with its contents.`,
          [
            { label: 'Cancel', action: 'cancel', variant: 'secondary' },
            { label: 'Deactivate Only', action: 'deactivate', variant: 'secondary' },
            { label: 'Deactivate & Delete folder', action: 'delete', variant: 'danger' }
          ],
          (action) => {
            if (action === 'deactivate') {
              deactivateMode(modeId, false);
            } else if (action === 'delete') {
              deactivateMode(modeId, true);
            }
          }
        );
      } else {
        activateMode(modeId);
      }
    } else {
      console.warn(`Mode with code ${code} not found in store`);
    }
  };

  // Handle mode right-click for context menu
  const handleModeContextMenu = (e: KonvaEventObject<MouseEvent>, modeId: string | undefined, code: string, description: string) => {
    e.evt.preventDefault();

    if (!modeId) {
      console.warn(`Mode with code ${code} not found in store`);
      return;
    }

    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    const options = [
      {
        label: t('COMMON.USER_ACTION_DEACTIVATE') || 'Deactivate',
        action: () => {
          if (modeId) {
            usePopupStore.getState().showConfirm(
              t('COMMON.CONFIRM_DEACTIVATE_TITLE') || 'Deactivate Mode',
              `Are you sure you want to deactivate mode ${code}? This mode has an associated folder.${'\n\n'}You can choose to keep the folder or delete it along with its contents.`,
              [
                { label: 'Cancel', action: 'cancel', variant: 'secondary' },
                { label: 'Deactivate Only', action: 'deactivate', variant: 'secondary' },
                { label: 'Deactivate & Delete folder', action: 'delete', variant: 'danger' }
              ],
              (action) => {
                if (action === 'deactivate') {
                  deactivateMode(modeId, false);
                } else if (action === 'delete') {
                  deactivateMode(modeId, true);
                }
              }
            );
          }
        },
        icon: 'power-off',
      },
      {
        label: t('COMMON.USER_ACTION_ACTIVATE') || 'Activate',
        action: () => modeId && activateMode(modeId),
        icon: 'power',
      },
      {
        label: t('COMMON.USER_ACTION_EDIT_DESC') || 'Edit Description',
        action: () => {
          showPopup(
            'prompt',
            `Edit ${code} Description`,
            'Enter a new description for this mode:',
            (newDescription?: string) => {
              if (newDescription && newDescription.trim() !== '') {
                useGsrsmStore.getState().updateMode(modeId, { description: newDescription });
              }
            },
            description
          );
        },
        icon: 'edit',
      }
    ];

    showContextMenu(pointerPos, options);
  };

  // Render a Gsrsm mode box
  const renderModeBox = (
    code: string,
    title: string,
    x: number,
    y: number,
    width: number,
    height: number,
    doubleStroke: boolean = false,
    boldBorder: boolean = false
  ) => {
    const mode = modes.find(m => m.code === code);
    const isActive = mode?.type === 'active';
    const modeId = mode?.id;

    const getFillColor = () => {
      if (isActive) return theme.mode === 'light' ? '#e0f2fe' : '#1e3a5f';
      return theme.mode === 'light' ? '#ffffff' : '#2d2d2d';
    };

    const getBorderColorForMode = () => {
      if (isActive) return theme.mode === 'light' ? '#0ea5e9' : '#38bdf8';
      return getBorderColor();
    };

    return (
      <Group
        x={x}
        y={y}
        onClick={() => handleModeClick(modeId, code)}
        onTap={() => handleModeClick(modeId, code)}
        onDblClick={() => {
          showPopup(
            'prompt',
            `Edit ${code} Description`,
            'Enter a new description for this mode:',
            (newDescription?: string) => {
              if (modeId && newDescription && newDescription.trim() !== '') {
                useGsrsmStore.getState().updateMode(modeId, { description: newDescription });
              }
            },
            mode?.description || ''
          );
        }}
        onContextMenu={(e) => handleModeContextMenu(e, modeId, code, mode?.description || '')}
        cursor="pointer"
      >
        <Rect
          width={width}
          height={height}
          fill={getFillColor()}
          stroke={getBorderColorForMode()}
          strokeWidth={isActive ? 3 : (boldBorder ? 4 : 1)}
        />

        {doubleStroke && (
          <Rect
            x={3}
            y={3}
            width={width - 6}
            height={height - 6}
            stroke={getBorderColorForMode()}
            strokeWidth={1}
            fill="transparent"
          />
        )}

        <Circle
          x={15}
          y={15}
          radius={10}
          fill={isActive ? (theme.mode === 'light' ? '#0ea5e9' : '#38bdf8') : '#ffffff'}
          stroke={getBorderColor()}
          strokeWidth={1}
        />

        <Text
          text={code}
          x={5}
          y={5}
          width={20}
          height={20}
          fontSize={code === 'F1' ? Gsrsm_MODE_CODE_FONT_SIZE + 2 : Gsrsm_MODE_CODE_FONT_SIZE}
          fontStyle="bold"
          fill={isActive ? (theme.mode === 'light' ? theme.text : '#ffffff') : getTextColor()}
          align="center"
          verticalAlign="middle"
        />

        <Text
          text={`<${title}>`}
          x={code === 'F1' ? 35 : 30}
          y={10}
          width={width - 35}
          fontSize={code === 'F1' ? Gsrsm_MODE_TITLE_FONT_SIZE + 1 : Gsrsm_MODE_TITLE_FONT_SIZE - 1}
          fill={getTextColor()}
          wrap="word"
        />
      </Group>
    );
  };

  return (
    <Group>
      {/* Render A modes */}
      {renderModeBox('A1', t('Gsrsm.MODES.A1.TITLE'),
        positions.A.A1.x, positions.A.A1.y, positions.A.A1.width, positions.A.A1.height, positions.A.A1.doubleStroke)}
      {renderModeBox('A2', t('Gsrsm.MODES.A2.TITLE'),
        positions.A.A2.x, positions.A.A2.y, positions.A.A2.width, positions.A.A2.height)}
      {renderModeBox('A3', t('Gsrsm.MODES.A3.TITLE'),
        positions.A.A3.x, positions.A.A3.y, positions.A.A3.width, positions.A.A3.height)}
      {renderModeBox('A4', t('Gsrsm.MODES.A4.TITLE'),
        positions.A.A4.x, positions.A.A4.y, positions.A.A4.width, positions.A.A4.height)}
      {renderModeBox('A5', t('Gsrsm.MODES.A5.TITLE'),
        positions.A.A5.x, positions.A.A5.y, positions.A.A5.width, positions.A.A5.height)}
      {renderModeBox('A6', t('Gsrsm.MODES.A6.TITLE'),
        positions.A.A6.x, positions.A.A6.y, positions.A.A6.width, positions.A.A6.height)}
      {renderModeBox('A7', t('Gsrsm.MODES.A7.TITLE'),
        positions.A.A7.x, positions.A.A7.y, positions.A.A7.width, positions.A.A7.height)}

      {/* Render D modes */}
      {renderModeBox('D1', t('Gsrsm.MODES.D1.TITLE'),
        positions.D.D1.x, positions.D.D1.y, positions.D.D1.width, positions.D.D1.height)}
      {renderModeBox('D2', t('Gsrsm.MODES.D2.TITLE'),
        positions.D.D2.x, positions.D.D2.y, positions.D.D2.width, positions.D.D2.height)}
      {renderModeBox('D3', t('Gsrsm.MODES.D3.TITLE'),
        positions.D.D3.x, positions.D.D3.y, positions.D.D3.width, positions.D.D3.height)}

      {/* Render F modes */}
      {renderModeBox('F1', t('Gsrsm.MODES.F1.TITLE'),
        positions.F.F1.x, positions.F.F1.y, positions.F.F1.width, positions.F.F1.height, false, positions.F.F1.boldBorder)}
      {renderModeBox('F2', t('Gsrsm.MODES.F2.TITLE'),
        positions.F.F2.x, positions.F.F2.y, positions.F.F2.width, positions.F.F2.height)}
      {renderModeBox('F3', t('Gsrsm.MODES.F3.TITLE'),
        positions.F.F3.x, positions.F.F3.y, positions.F.F3.width, positions.F.F3.height)}
      {renderModeBox('F4', t('Gsrsm.MODES.F4.TITLE'),
        positions.F.F4.x, positions.F.F4.y, positions.F.F4.width, positions.F.F4.height)}
      {renderModeBox('F5', t('Gsrsm.MODES.F5.TITLE'),
        positions.F.F5.x, positions.F.F5.y, positions.F.F5.width, positions.F.F5.height)}
      {renderModeBox('F6', t('Gsrsm.MODES.F6.TITLE'),
        positions.F.F6.x, positions.F.F6.y, positions.F.F6.width, positions.F.F6.height)}
    </Group>
  );
};

export default GsrsmModes;
