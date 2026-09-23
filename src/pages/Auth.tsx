import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Shield, TrendingUp, FileText, Mail, CheckCircle2, Sparkles, ArrowLeft } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Welcome back!");
      navigate("/dashboard");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupEmail || !signupPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    if (signupPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName);
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      // Show email confirmation popup
      setRegisteredEmail(signupEmail);
      setShowEmailConfirmation(true);
    }
  };

  // Email Confirmation Modal
  const EmailConfirmationModal = () => (
    <Dialog open={showEmailConfirmation} onOpenChange={setShowEmailConfirmation}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader className="text-center items-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-br from-indigo-100 to-teal-100 flex items-center justify-center mb-4">
            <Mail className="h-10 w-10 text-indigo-600" />
          </div>
          <DialogTitle className="text-2xl font-bold">Check Your Email!</DialogTitle>
          <DialogDescription className="text-base mt-2">
            We've sent a confirmation link to
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-lg font-semibold text-indigo-600 bg-indigo-50 rounded-lg py-3 px-4">
            {registeredEmail}
          </p>
        </div>

        <div className="space-y-4 text-left bg-slate-50 rounded-xl p-4">
          <h4 className="font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            Next Steps:
          </h4>
          <ol className="space-y-3 text-sm text-slate-600">
            <li className="flex items-start gap-3">
              <span className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0">1</span>
              <span>Open your email inbox (check spam folder too)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0">2</span>
              <span>Click the <strong>"Confirm your email"</strong> link in the email from EasyITR</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0">3</span>
              <span>Come back here and log in to start filing!</span>
            </li>
          </ol>
        </div>

        <div className="flex flex-col gap-3 mt-4">
          <Button
            onClick={() => setShowEmailConfirmation(false)}
            className="w-full bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Got it, I'll check my email
          </Button>
          <p className="text-xs text-slate-400">
            Didn't receive the email? Check your spam folder or <button className="text-indigo-600 hover:underline">resend verification</button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-primary text-primary-foreground p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <img src="/logo.png" alt="EasyITR" className="h-12 w-12 rounded-xl" />
            <span className="text-2xl font-bold">EasyITR</span>
          </div>

          <h1 className="text-4xl font-bold mb-4">
            Simplify Your Tax Filing Journey
          </h1>
          <p className="text-lg text-primary-foreground/80 mb-12">
            AI-powered tax filing for individuals and professionals.
            Prepare a draft and follow the official portal filing steps.
          </p>
        </div>

        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Secure & Compliant</h3>
              <p className="text-sm text-primary-foreground/70">
                Sign in to access your personal filing workspace
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Smart Tax Optimization</h3>
              <p className="text-sm text-primary-foreground/70">
                AI compares Old vs New regime to maximize your savings
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Easy E-Filing</h3>
              <p className="text-sm text-primary-foreground/70">
                Review your draft, then submit and e-verify on the official portal
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm text-primary-foreground/50">
          © 2026 EasyITR Technologies. All rights reserved.
        </p>
      </div>

      {/* Right side - Auth forms */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <img src="/logo.png" alt="EasyITR" className="h-10 w-10 rounded-xl" />
            <span className="text-xl font-bold">EasyITR</span>
          </div>

          <Button
            variant="ghost"
            className="mb-4 -ml-4 text-muted-foreground hover:text-primary gap-2"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Welcome back</CardTitle>
                  <CardDescription>
                    Enter your credentials to access your account
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="you@example.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>

            <TabsContent value="signup">
              <Card>
                <CardHeader>
                  <CardTitle>Create an account</CardTitle>
                  <CardDescription>
                    Start your tax filing journey today
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleSignup}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="Full Name"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        disabled={loading}
                      />
                      <p className="text-xs text-muted-foreground">
                        Must be at least 6 characters
                      </p>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Create Account"
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>
          </Tabs>

          <p className="text-center text-sm text-muted-foreground mt-6">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>

      {/* Email Confirmation Modal */}
      <EmailConfirmationModal />
    </div>
  );
}

