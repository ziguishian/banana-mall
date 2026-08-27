"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n/store";
import { cn } from "@/lib/utils";

type Order = {
  id: string;
  amountCents: number;
  credits: number;
  status: string;
  outTradeNo: string;
  paidAt: string | null;
  createdAt: string;
};

type CreatedOrder = {
  orderId: string;
  outTradeNo: string;
  qrcodeUrl: string | null;
  payUrl: string | null;
  credits: number;
};

const packages = [
  { cents: 500, label: "¥5 / 25 次" },
  { cents: 1000, label: "¥10 / 50 次" },
  { cents: 2000, label: "¥20 / 100 次" },
  { cents: 5000, label: "¥50 / 250 次" },
  { cents: 10000, label: "¥100 / 500 次" },
];

function getStatusText(status: string) {
  if (status === "PAID") return "已支付";
  if (status === "PENDING") return "待支付";
  if (status === "CANCELED") return "已取消";
  return status;
}

export default function RechargePage() {
  const t = useTranslation();
  const [selectedCents, setSelectedCents] = useState(1000);
  const [customCents, setCustomCents] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<CreatedOrder | null>(null);
  const [qrImageFailed, setQrImageFailed] = useState(false);
  const [generatedQrUrl, setGeneratedQrUrl] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch("/api/credits/orders");
      const data = await res.json();
      if (data.success) setOrders(data.data);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!pendingOrder) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/credits/orders/${pendingOrder.orderId}`);
        const data = await res.json();
        if (active && data.success && data.data.status === "PAID") {
          toast.success(`充值成功，已到账 ${pendingOrder.credits} 次`);
          setPendingOrder(null);
          loadOrders();
          window.location.reload();
        }
      } catch {}
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pendingOrder, loadOrders]);

  useEffect(() => {
    setGeneratedQrUrl(null);
    setQrImageFailed(false);
    const source = pendingOrder?.qrcodeUrl ?? pendingOrder?.payUrl;
    if (!source) return;
    let active = true;
    QRCode.toDataURL(source, { margin: 1, width: 256 })
      .then((url) => {
        if (active) setGeneratedQrUrl(url);
      })
      .catch(() => {
        if (active) setGeneratedQrUrl(null);
      });
    return () => {
      active = false;
    };
  }, [pendingOrder]);

  async function handlePay(cents: number) {
    if (cents < 100) {
      toast.error("最低充值 1 元");
      return;
    }
    setCreating(true);
    setQrImageFailed(false);
    try {
      const res = await fetch("/api/credits/recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error?.message ?? "下单失败");
        return;
      }
      setPendingOrder(data.data);
      toast.success("订单已创建，请扫码支付");
    } finally {
      setCreating(false);
    }
  }

  function handlePackagePay(cents: number) {
    setSelectedCents(cents);
    handlePay(cents);
  }

  function handleCustomPay() {
    const yuan = Number(customCents);
    if (!Number.isFinite(yuan) || yuan < 1) {
      toast.error("请输入有效金额");
      return;
    }
    handlePay(Math.floor(yuan * 100));
  }

  const displayQrUrl = pendingOrder?.qrcodeUrl && !qrImageFailed ? pendingOrder.qrcodeUrl : generatedQrUrl;
  const canShowQrImage = Boolean(displayQrUrl && !qrImageFailed);
  const paymentUrl = pendingOrder?.payUrl ?? pendingOrder?.qrcodeUrl ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("recharge.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("recharge.desc")}</p>
      </div>

      {pendingOrder && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5">
          <CardHeader>
            <CardTitle>{canShowQrImage ? t("recharge.scanTip") : "正在生成支付二维码"}</CardTitle>
            <CardDescription>{t("recharge.processing")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {canShowQrImage ? (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayQrUrl!}
                  alt="支付二维码"
                  className="h-56 w-56 object-contain"
                  onError={() => setQrImageFailed(true)}
                />
              </div>
            ) : null}
            {paymentUrl ? (
              <Button variant={canShowQrImage ? "outline" : "default"} onClick={() => window.open(paymentUrl, "_blank", "noopener,noreferrer")}>
                <ExternalLink className="mr-2 h-4 w-4" />
                打开支付页
              </Button>
            ) : null}
            <div className="text-center">
              <p className="text-sm font-medium">{pendingOrder.credits} {t("common.credits")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{pendingOrder.outTradeNo}</p>
            </div>
            <Button variant="outline" onClick={() => setPendingOrder(null)}>
              {t("common.cancel")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("recharge.packages")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {packages.map((pkg) => (
              <button
                key={pkg.cents}
                type="button"
                onClick={() => handlePackagePay(pkg.cents)}
                disabled={creating}
                className={cn(
                  "rounded-2xl border p-4 text-left transition hover:border-slate-400 hover:shadow-md disabled:opacity-50",
                  selectedCents === pkg.cents ? "border-slate-900 bg-slate-50 dark:border-white dark:bg-white/5" : "border-slate-200 dark:border-white/10",
                )}
              >
                <p className="text-lg font-semibold">{pkg.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("recharge.payNative")}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("recharge.customAmount")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="customAmount">{t("recharge.amount")}（元）</Label>
            <Input
              id="customAmount"
              type="number"
              min="1"
              step="1"
              value={customCents}
              onChange={(e) => setCustomCents(e.target.value)}
              placeholder="例如 15"
              className="w-40"
            />
          </div>
          <Button onClick={handleCustomPay} disabled={creating}>
            {creating ? t("recharge.processing") : t("recharge.pay")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("recharge.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("recharge.historyEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">{t("recharge.colAmount")}</th>
                    <th className="pb-2 pr-4">{t("common.credits")}</th>
                    <th className="pb-2 pr-4">{t("recharge.colStatus")}</th>
                    <th className="pb-2 pr-4">{t("recharge.colTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">¥{(order.amountCents / 100).toFixed(2)}</td>
                      <td className="py-3 pr-4">+{order.credits}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            order.status === "PAID"
                              ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                              : order.status === "PENDING"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                                : "bg-slate-100 text-slate-500 dark:bg-white/8 dark:text-slate-400",
                          )}
                        >
                          {getStatusText(order.status)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleString("zh-CN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
