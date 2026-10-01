"use client";

import { useEffect } from "react";
import { CallsDesk } from "@/components/calls-desk";
import { PRODUCT_NAME } from "@/lib/product";

export default function CallsPopupPage() {
  useEffect(() => {
    document.title = `Dialer · ${PRODUCT_NAME}`;
  }, []);

  return <CallsDesk variant="popup" />;
}
