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
export {
  DateField,
  DateRangeField,
  TimeField,
  type DateFieldProps,
  type DateRange,
  type TimeFieldProps,
} from './components/date-time.js';
export { Combobox, Select, type ComboboxProps, type Option, type SelectProps } from './components/select.js';
export { MoneyInput, PhoneInput, type MoneyInputProps, type PhoneInputProps } from './components/phone-money.js';
export { DropdownMenu, Popover, type MenuItem } from './components/menu.js';
export { Tooltip } from './components/tooltip.js';
export { ConfirmDialog, ResponsiveDialog } from './components/dialog.js';
export { ToastProvider, useToast, type ToastInput, type ToastTone } from './components/toast.js';
export { Card, StatCard } from './components/card.js';
export { Tabs, type TabItem } from './components/tabs.js';
export { DataTable, type Column } from './components/table.js';
export { List, ListItem, type ListAction } from './components/list.js';
export { Banner, EmptyState, Skeleton } from './components/states.js';
export { cn } from './lib/cn.js';
