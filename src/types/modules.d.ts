// Module declarations for native-only dependencies not yet installed.
// These packages are installed during EAS build (native build step).

declare module 'react-native-android-widget' {
  import React from 'react';

  interface WidgetStyle {
    backgroundColor?: string;
    color?: string;
    fontSize?: number;
    fontWeight?: string | number;
    flex?: number;
    flexDirection?: 'row' | 'column';
    alignItems?: string;
    justifyContent?: string;
    padding?: number;
    [key: string]: unknown;
  }

  interface FlexWidgetProps {
    style?: WidgetStyle;
    children?: React.ReactNode;
  }

  interface TextWidgetProps {
    text: string;
    style?: WidgetStyle;
  }

  interface ImageWidgetProps {
    image: string | number;
    imageWidth?: number;
    imageHeight?: number;
    style?: WidgetStyle;
  }

  interface SvgWidgetProps {
    svg: string;
    style?: WidgetStyle;
  }

  export function FlexWidget(props: FlexWidgetProps): JSX.Element;
  export function TextWidget(props: TextWidgetProps): JSX.Element;
  export function ImageWidget(props: ImageWidgetProps): JSX.Element;
  export function SvgWidget(props: SvgWidgetProps): JSX.Element;
  export function registerWidgetTaskHandler(handler: (props: unknown) => Promise<void>): void;
  export function updateWidget(params: unknown): Promise<void>;
}

declare module 'expo-widgets' {
  type WidgetProps = Record<string, unknown>;
  type WidgetComponent<P extends WidgetProps = WidgetProps> = (props: P) => JSX.Element | null;

  export function createWidget<P extends WidgetProps>(
    name: string,
    component: WidgetComponent<P>
  ): {
    updateTimeline: (entries: Array<{ date: Date; props: P }>) => Promise<void>;
    reload: () => Promise<void>;
  };
}
