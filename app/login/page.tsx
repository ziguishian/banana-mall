import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string };
}) {
  const redirect = typeof searchParams.redirect === "string" ? searchParams.redirect : undefined;
  return <AuthForm mode="login" redirect={redirect} />;
}
