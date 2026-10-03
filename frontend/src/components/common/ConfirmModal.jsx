import Modal from "./Modal";
import Button from "./Button";
import { AlertTriangle, AlertCircle, HelpCircle } from "lucide-react";

export default function ConfirmModal({
  isOpen,
  title = "Confirmation",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger", // "danger" | "warning" | "primary"
  loading = false,
  onConfirm,
  onClose,
}) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: AlertCircle,
      iconColor: "text-rose-400",
      iconBg: "bg-rose-500/10 border border-rose-500/20",
      btnVariant: "danger",
    },
    warning: {
      icon: AlertTriangle,
      iconColor: "text-amber-400",
      iconBg: "bg-amber-500/10 border border-amber-500/20",
      btnVariant: "secondary",
    },
    primary: {
      icon: HelpCircle,
      iconColor: "text-accent",
      iconBg: "bg-accent/10 border border-accent/20",
      btnVariant: "primary",
    },
  };

  const style = variantStyles[variant] || variantStyles.danger;
  const Icon = style.icon;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={style.btnVariant}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3 py-1">
        <div className={`p-2.5 rounded-xl shrink-0 ${style.iconBg}`}>
          <Icon className={`h-5 w-5 ${style.iconColor}`} />
        </div>
        <div className="text-sm text-gray-300 leading-relaxed pt-1">
          {message}
        </div>
      </div>
    </Modal>
  );
}
