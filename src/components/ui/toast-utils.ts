export interface ToastMessage {
  id: number;
  text: string;
  type: "success" | "error";
}

/** Helper to trigger a toast; pass the setState setter from the parent. */
export function showToast(
  setToast: React.Dispatch<React.SetStateAction<ToastMessage | null>>,
  text: string,
  type: "success" | "error" = "success",
) {
  setToast({ id: Date.now(), text, type });
}
