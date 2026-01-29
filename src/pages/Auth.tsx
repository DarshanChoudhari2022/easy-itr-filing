import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Shield, TrendingUp, FileText } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  
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
      toast.success("Account created successfully!");
      navigate("/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-primary text-primary-foreground p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="h-12 w-12 rounded-lg bg-accent flex items-center justify-center font-bold text-xl text-accent-foreground">
              BT
            </div>
            <span className="text-2xl font-bold">BharatTax</span>
          </div>
          
          <h1 className="text-4xl font-bold mb-4">
            Simplify Your Tax Filing Journey
          </h1>
          <p className="text-lg text-primary-foreground/80 mb-12">
            AI-powered tax filing for individuals and professionals. 
            File ITR 1-4 with confidence.
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
                Your data is encrypted and protected with enterprise-grade security
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
                Generate ITR JSON ready for upload to the Income Tax portal
              </p>
            </div>
          </div>
        </div>
        
        <p className="text-sm text-primary-foreground/50">
          © 2026 BharatTax. All rights reserved.
        </p>
      </div>
      
      {/* Right side - Auth forms */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center font-bold text-lg text-primary-foreground">
              BT
            </div>
            <span className="text-xl font-bold">BharatTax</span>
          </div>
          
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
                        placeholder="John Doe"
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
    </div>
  );
}
