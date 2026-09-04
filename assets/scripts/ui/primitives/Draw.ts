import {
  Button,
  type Color,
  EditBox,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  UITransform,
  VerticalTextAlignment,
} from "cc";
import { COLORS, withAlpha } from "./Colors";

export interface ButtonStyle {
  fill: Color;
  stroke?: Color;
  text?: Color;
  fontSize?: number;
  enabled?: boolean;
}

export interface ToggleStyle {
  enabled?: boolean;
  fontSize?: number;
}

export type LabelSizing = "shrink" | "fixed";

export function removeAndDestroy(node: Node): void {
  node.removeFromParent();
  node.destroy();
}

export function addLabel(
  parent: Node,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  textColor: Color,
  bold = false,
  maxLines = 1,
  horizontalAlign = HorizontalTextAlignment.CENTER,
  sizing: LabelSizing = "shrink",
): Label {
  const node = createUiNode(parent, `Label-${text.slice(0, 12)}`);
  node.setPosition(x, y);
  setSize(node, width, height);
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = Math.max(fontSize + 6, Math.floor(height / maxLines));
  label.color = textColor;
  label.horizontalAlign = horizontalAlign;
  label.verticalAlign = VerticalTextAlignment.CENTER;
  label.enableWrapText = maxLines > 1;
  label.overflow =
    sizing === "fixed" ? Label.Overflow.CLAMP : Label.Overflow.SHRINK;
  label.isBold = bold;
  return label;
}

export function createButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  style: ButtonStyle,
  onClick: () => void,
): Node {
  const enabled = style.enabled ?? true;
  const node = createUiNode(parent, `Button-${text}`);
  node.setPosition(x, y);
  setSize(node, width, height);
  const background = node.addComponent(Graphics);
  background.fillColor = enabled ? style.fill : COLORS.panel;
  background.roundRect(-width / 2, -height / 2, width, height, 6);
  background.fill();
  if (style.stroke) {
    background.strokeColor = enabled ? style.stroke : COLORS.textMuted;
    background.lineWidth = 2;
    background.roundRect(-width / 2, -height / 2, width, height, 6);
    background.stroke();
  }
  const button = node.addComponent(Button);
  button.interactable = enabled;
  button.transition = Button.Transition.SCALE;
  button.zoomScale = 0.96;
  if (enabled) node.on(Button.EventType.CLICK, onClick);
  addLabel(
    node,
    text,
    0,
    0,
    width - 20,
    height - 10,
    style.fontSize ?? 21,
    enabled ? (style.text ?? COLORS.text) : COLORS.textMuted,
    true,
    1,
    HorizontalTextAlignment.CENTER,
    "fixed",
  );
  return node;
}

export function createToggle(
  parent: Node,
  name: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  checked: boolean,
  style: ToggleStyle,
  onToggle: () => void,
): Node {
  const enabled = style.enabled ?? true;
  const node = createUiNode(parent, `Toggle-${name}-${checked ? "On" : "Off"}`);
  node.setPosition(x, y);
  setSize(node, width, height);

  const button = node.addComponent(Button);
  button.interactable = enabled;
  button.transition = Button.Transition.SCALE;
  button.zoomScale = 0.96;
  if (enabled) node.on(Button.EventType.CLICK, onToggle);

  addLabel(
    node,
    label,
    -24,
    0,
    68,
    height - 4,
    style.fontSize ?? 14,
    enabled ? COLORS.text : COLORS.textMuted,
    false,
    1,
    HorizontalTextAlignment.LEFT,
    "fixed",
  );

  const track = graphicsNode(node, `${name}-Track`, 34, 0);
  track.fillColor = enabled
    ? checked
      ? COLORS.inkGreenLight
      : COLORS.panelStrong
    : COLORS.panel;
  track.roundRect(-20, -11, 40, 22, 11);
  track.fill();
  track.strokeColor = enabled
    ? checked
      ? COLORS.jade
      : COLORS.textMuted
    : COLORS.textMuted;
  track.lineWidth = 2;
  track.roundRect(-20, -11, 40, 22, 11);
  track.stroke();
  track.fillColor = enabled
    ? checked
      ? COLORS.green
      : COLORS.textMuted
    : COLORS.textMuted;
  track.circle(checked ? 9 : -9, 0, 7);
  track.fill();
  return node;
}

export function createTextInput(
  parent: Node,
  value: string,
  placeholder: string,
  x: number,
  y: number,
  width: number,
  height: number,
  onChange: (value: string) => void,
  onSubmit: (value: string) => void,
  enabled = true,
  options: {
    name?: string;
    fontSize?: number;
    inputMode?: EditBox["inputMode"];
    maxLength?: number;
  } = {},
): EditBox {
  const node = createUiNode(parent, options.name ?? "ProfileNameInput");
  node.setPosition(x, y);
  setSize(node, width, height);

  const background = node.addComponent(Graphics);
  background.fillColor = enabled ? COLORS.black : COLORS.panel;
  background.roundRect(-width / 2, -height / 2, width, height, 6);
  background.fill();
  background.strokeColor = enabled ? COLORS.goldMuted : COLORS.textMuted;
  background.lineWidth = 2;
  background.roundRect(-width / 2, -height / 2, width, height, 6);
  background.stroke();

  const textLabel = addLabel(
    node,
    value,
    0,
    0,
    width - 32,
    height - 12,
    options.fontSize ?? 19,
    COLORS.text,
    false,
    1,
    HorizontalTextAlignment.LEFT,
  );
  const placeholderLabel = addLabel(
    node,
    placeholder,
    0,
    0,
    width - 32,
    height - 12,
    options.fontSize ?? 19,
    COLORS.textMuted,
    false,
    1,
    HorizontalTextAlignment.LEFT,
  );
  const editBox = node.addComponent(EditBox);
  editBox.enabled = enabled;
  editBox.textLabel = textLabel;
  editBox.placeholderLabel = placeholderLabel;
  // `addComponent` runs EditBox's preload, and because neither label is wired up
  // yet it builds its own `TEXT_LABEL` / `PLACEHOLDER_LABEL` children with Cocos
  // defaults — white, fontSize 40. Handing it ours on the two lines above does
  // not take those back, so the default placeholder string stays on screen
  // underneath the real one. Drop whatever it made that we are not using.
  for (const child of [...node.children]) {
    if (child === textLabel.node || child === placeholderLabel.node) continue;
    if (child.name === "TEXT_LABEL" || child.name === "PLACEHOLDER_LABEL") {
      removeAndDestroy(child);
    }
  }
  editBox.inputMode = options.inputMode ?? EditBox.InputMode.SINGLE_LINE;
  editBox.inputFlag = EditBox.InputFlag.DEFAULT;
  editBox.returnType = EditBox.KeyboardReturnType.DONE;
  editBox.maxLength = options.maxLength ?? 12;
  editBox.placeholder = placeholder;
  editBox.string = value;
  node.on(EditBox.EventType.TEXT_CHANGED, (box: EditBox) => {
    onChange(box.string);
  });
  node.on(
    EditBox.EventType.EDITING_RETURN,
    (box: EditBox, finalText?: string) => {
      const value = finalText ?? box.string;
      box.string = value;
      onChange(value);
      onSubmit(value);
    },
  );
  return editBox;
}

export function drawPagination(
  parent: Node,
  name: string,
  x: number,
  y: number,
  page: number,
  pageCount: number,
  onPrevious: () => void,
  onNext: () => void,
): void {
  if (pageCount <= 1) return;

  drawPageButton(parent, `${name}-Previous`, "<", x - 72, y, page > 0, onPrevious);
  addLabel(parent, `${page + 1} / ${pageCount}`, x, y, 78, 32, 16, COLORS.textMuted, true);
  drawPageButton(
    parent,
    `${name}-Next`,
    ">",
    x + 72,
    y,
    page + 1 < pageCount,
    onNext,
  );
}

export function drawPageButton(
  parent: Node,
  name: string,
  text: string,
  x: number,
  y: number,
  enabled: boolean,
  onClick: () => void,
): void {
  if (enabled) {
    createButton(
      parent,
      text,
      x,
      y,
      52,
      36,
      { fill: COLORS.inkGreenLight, stroke: COLORS.goldMuted, fontSize: 18 },
      onClick,
    );
    return;
  }

  drawBand(parent, name, x, y, 52, 36, COLORS.panel);
  addLabel(parent, text, x, y, 32, 26, 18, COLORS.textMuted, true);
}

export function drawOrnatePanel(
  parent: Node,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  drawBand(
    parent,
    name,
    x,
    y,
    width,
    height,
    withAlpha(COLORS.panelStrong, 239),
    COLORS.goldMuted,
  );
  const ornaments = graphicsNode(parent, `${name}-Ornaments`, x, y);
  ornaments.strokeColor = COLORS.goldMuted;
  ornaments.lineWidth = 2;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  for (const direction of [-1, 1]) {
    ornaments.moveTo(direction * (halfWidth - 10), halfHeight - 12);
    ornaments.lineTo(direction * (halfWidth - 28), halfHeight - 12);
    ornaments.lineTo(direction * (halfWidth - 38), halfHeight - 2);
    ornaments.moveTo(direction * (halfWidth - 10), -halfHeight + 12);
    ornaments.lineTo(direction * (halfWidth - 28), -halfHeight + 12);
    ornaments.lineTo(direction * (halfWidth - 38), -halfHeight + 2);
  }
  ornaments.stroke();
}

export function drawBand(
  parent: Node,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Color,
  stroke?: Color,
): void {
  const graphic = graphicsNode(parent, name, x, y);
  graphic.fillColor = fill;
  graphic.roundRect(-width / 2, -height / 2, width, height, 6);
  graphic.fill();
  if (stroke) {
    graphic.strokeColor = stroke;
    graphic.lineWidth = 1;
    graphic.roundRect(-width / 2, -height / 2, width, height, 6);
    graphic.stroke();
  }
}

export function drawProgress(
  parent: Node,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
): Graphics {
  const graphic = graphicsNode(parent, "Progress", x, y);
  redrawProgress(graphic, width, height, progress);
  return graphic;
}

export function redrawProgress(
  graphic: Graphics,
  width: number,
  height: number,
  progress: number,
): void {
  graphic.clear();
  graphic.fillColor = COLORS.black;
  graphic.roundRect(-width / 2, -height / 2, width, height, height / 2);
  graphic.fill();
  const fillWidth = Math.max(height, width * Math.min(1, Math.max(0, progress)));
  graphic.fillColor = COLORS.gold;
  graphic.roundRect(-width / 2, -height / 2, fillWidth, height, height / 2);
  graphic.fill();
}

export function graphicsNode(parent: Node, name: string, x: number, y: number): Graphics {
  const node = createUiNode(parent, name);
  node.setPosition(x, y);
  return node.addComponent(Graphics);
}

export function createUiNode(parent: Node, name: string): Node {
  const node = new Node(name);
  node.layer = parent.layer;
  parent.addChild(node);
  return node;
}

export function setSize(node: Node, width: number, height: number): UITransform {
  const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
  transform.setContentSize(width, height);
  transform.setAnchorPoint(0.5, 0.5);
  return transform;
}
