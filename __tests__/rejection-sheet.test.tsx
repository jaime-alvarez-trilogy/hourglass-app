/**
 * @jest-environment jsdom
 */
// FR3: RejectionSheet component — dark glass aesthetic
import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';
import { RejectionSheet } from '../src/components/RejectionSheet';

const REJECTION_SHEET_FILE = path.resolve(__dirname, '../src/components/RejectionSheet.tsx');

// =============================================================================
// FR5 (old): RejectionSheet rendering and behavior (retained)
// =============================================================================

describe('FR5: RejectionSheet', () => {
  it('FR5_renders_with_prefilled_Not_approved_text', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(RejectionSheet, {
          visible: true,
          onConfirm: jest.fn(),
          onCancel: jest.fn(),
        })
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Not approved');
  });

  it('FR5_renders_Confirm_Reject_button', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(RejectionSheet, {
          visible: true,
          onConfirm: jest.fn(),
          onCancel: jest.fn(),
        })
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Confirm');
  });

  it('FR5_renders_Cancel_button', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(RejectionSheet, {
          visible: true,
          onConfirm: jest.fn(),
          onCancel: jest.fn(),
        })
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Cancel');
  });

  it('FR5_Confirm_button_disabled_when_input_is_empty', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(RejectionSheet, {
          visible: true,
          onConfirm: jest.fn(),
          onCancel: jest.fn(),
          initialReason: '',
        })
      );
    });
    // Find the Confirm button and check its disabled prop
    // TouchableOpacity renders as div with aria-disabled in web/jsdom environment
    const json = tree.toJSON();
    const text = JSON.stringify(json);
    expect(text).toMatch(/"disabled":true|"aria-disabled":true/);
  });

  it('FR5_Confirm_button_disabled_when_input_is_whitespace_only', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(RejectionSheet, {
          visible: true,
          onConfirm: jest.fn(),
          onCancel: jest.fn(),
          initialReason: '   ',
        })
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toMatch(/"disabled":true|"aria-disabled":true/);
  });

  it('FR5_onCancel_called_when_Cancel_pressed', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(RejectionSheet, {
          visible: true,
          onConfirm,
          onCancel,
        })
      );
    });

    // Find Cancel button by accessibilityLabel and press it
    const instance = tree.root;
    const cancelBtn = instance.findAll(
      (node: any) =>
        node.props?.onPress !== undefined &&
        node.props?.accessibilityLabel === 'Cancel rejection'
    )[0];
    if (cancelBtn) act(() => cancelBtn.props.onPress());

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('FR5_onConfirm_not_called_when_Cancel_pressed', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(RejectionSheet, {
          visible: true,
          onConfirm,
          onCancel,
        })
      );
    });

    const instance = tree.root;
    const cancelBtn = instance.findAll(
      (node: any) =>
        node.props?.onPress !== undefined &&
        node.props?.accessibilityLabel === 'Cancel rejection'
    )[0];
    if (cancelBtn) act(() => cancelBtn.props.onPress());

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('FR5_not_rendered_when_visible_false', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(RejectionSheet, {
          visible: false,
          onConfirm: jest.fn(),
          onCancel: jest.fn(),
        })
      );
    });
    const json = tree.toJSON();
    expect(json).toBeNull();
  });
});

// =============================================================================
// FR3: RejectionSheet — source file: dark glass aesthetic (NativeWind migration)
// =============================================================================

describe('FR3: RejectionSheet — source file: NativeWind migration', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(REJECTION_SHEET_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('FR3 — no StyleSheet.create in source (comments stripped)', () => {
    expect(code).not.toContain('StyleSheet.create');
  });

  it('FR3 — no hardcoded hex color values in source outside allowed exceptions', () => {
    // Allowed exceptions: 'rgba(...)' for backdrop, '#484F58' for placeholderTextColor
    // Strip known allowed exceptions then check for remaining hex
    const withoutAllowed = code
      .replace(/rgba\([^)]+\)/g, '') // rgba values OK
      .replace(/#484F58/g, ''); // textMuted placeholder color OK
    expect(withoutAllowed).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });

  it('FR3 — source uses bg-surfaceElevated for sheet background', () => {
    expect(source).toContain('bg-surfaceElevated');
  });

  it('FR3 — source uses border-border for sheet border', () => {
    expect(source).toContain('border-border');
  });

  it('FR3 — source uses bg-surface for TextInput background', () => {
    expect(source).toContain('bg-surface');
  });

  it('FR3 — source uses bg-destructive for confirm button', () => {
    expect(source).toContain('bg-destructive');
  });

  it('FR3 — source uses text-textPrimary for title and input text', () => {
    expect(source).toContain('text-textPrimary');
  });

  it('FR3 — source uses text-textSecondary for cancel button text', () => {
    expect(source).toContain('text-textSecondary');
  });

  it('FR3 — source uses rounded-t-3xl for sheet top corners', () => {
    expect(source).toContain('rounded-t-3xl');
  });
});
