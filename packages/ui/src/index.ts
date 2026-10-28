// P1-T02: primitives. Containers/overlays/data/formatting land in P1-T04–T07.
export * from './theme.js';
export {
  Button,
  IconButton,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonProps,
} from './components/button.js';
export { Label } from './components/label.js';
export { FieldShell, Input, Textarea, type InputProps, type TextareaProps } from './components/input.js';
export {
  Checkbox,
  RadioGroup,
  RadioItem,
  SegmentedControl,
  Switch,
  type SegmentedOption,
} from './components/toggles.js';
export { Avatar, AvatarGroup } from './components/avatar.js';
export { Badge, Chip, ChipGroup, StatusPill } from './components/chip-badge.js';
export { cn } from './lib/cn.js';
