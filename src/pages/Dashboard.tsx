import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Wallet,
  Bitcoin,
  Receipt,
  BarChart3,
  FileText,
  MessageSquare,
  ArrowRight,
  TrendingUp,
  Building2,
  ShieldCheck,
  Clock,
  Zap,
  Calendar,
  Users,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
} from "lucide-react";
import { askTaxGuru } from "@/lib/ai-service";
import { toast } from "sonner";

export default function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showTasks, setShowTasks] = useState(true);

  // AI State
  const [question, setQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

      setProfile(profileData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAskAI = async () => {
    if (!question.trim()) return;
    setAsking(true);
    setAiResponse(null);
    const result = await askTaxGuru(question);
    setAiResponse(result.answer);
    setAsking(false);
    if (result.error) toast.error("AI service transient error. Retrying...");
  };

  const dashboardTasks = [
    { id: 1, title: "Self-Filing Wizard", status: "not_started", link: "/guided", icon: <Sparkles /> },
    { id: 2, title: "Import Crypto Trades", status: "pending", link: "/crypto", icon: <Bitcoin /> },
    { id: 3, title: "Verify Schedule FA", status: "completed", link: "/foreign", icon: <FileText /> },
    { id: 4, title: "Reconcile AIS/TIS", status: "not_started", link: "/ais", icon: <BarChart3 /> },
  ];

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight flex items-center gap-4">
              TaxBay Cockpit <Badge className="bg-indigo-600 text-[10px] animate-pulse">LIVE AY 2026-27</Badge>
            </h1>
            <p className="text-muted-foreground font-medium mt-1">
              Welcome back, {profile?.full_name || user?.email?.split("@")[0]} • Your data is secured with AES-256.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="gap-2 border-indigo-100 hover:bg-indigo-50 text-indigo-700">
              <Zap className="h-4 w-4 fill-indigo-500 text-indigo-500" /> AI Optimization
            </Button>
            <Button asChild className="bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20">
              <Link to="/efile">
                File Now <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Priority Action Center */}
        {showTasks && (
          <Card className="bg-indigo-900 border-none text-white overflow-hidden relative shadow-2xl shadow-indigo-100 mb-8">
            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-800/50 to-transparent pointer-events-none"></div>
            <CardHeader className="relative z-10">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-indigo-300" /> Start Your "No-CA" Filing
                </CardTitle>
                <button onClick={() => setShowTasks(false)} className="text-indigo-300 hover:text-white"><CheckCircle2 className="h-5 w-5" /></button>
              </div>
              <CardDescription className="text-indigo-200">Just tell us your income sources. We'll handle the ITR forms and Crypto tax Section 115BBH for you.</CardDescription>
            </CardHeader>
            <CardContent className="relative z-10 flex flex-col md:flex-row gap-6 items-center">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                {dashboardTasks.map((task) => (
                  <Link to={task.link} key={task.id} className="group">
                    <div className={`p-4 rounded-2xl border transition-all ${task.status === 'completed'
                      ? 'bg-emerald-500/20 border-emerald-500/30'
                      : 'bg-white/10 border-white/10 hover:bg-white/20'
                      }`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="p-2 rounded-lg bg-white/10 text-white">
                          {task.icon}
                        </div>
                        {task.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                      </div>
                      <h4 className="text-xs font-bold">{task.title}</h4>
                    </div>
                  </Link>
                ))}
              </div>
              <Button asChild size="lg" className="bg-white text-indigo-900 hover:bg-indigo-50 px-10 h-16 rounded-2xl font-black shadow-2xl">
                <Link to="/guided">START SIMPLE FILING <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Core Pillars */}
        <div className="grid gap-6 md:grid-cols-3">
          <ModuleCard
            title="GST Intelligence"
            desc="Monthly compliance & ITC analytics"
            value="₹45,200"
            sub="Payable"
            badge="On Track"
            color="primary"
            link="/gst"
            icon={<Building2 className="h-5 w-5" />}
          />
          <ModuleCard
            title="Income Tax"
            desc="Tax planning & systematic filing"
            value="₹18.4L"
            sub="Income"
            badge="Step 2/5"
            color="indigo-600"
            link="/income"
            icon={<Wallet className="h-5 w-5" />}
          />
          <ModuleCard
            title="Asset Tax (VDA)"
            desc="Section 115BBH Crypto Engine"
            value="₹2.85L"
            sub="Gains"
            badge="FIFO Applied"
            color="warning"
            link="/crypto"
            icon={<Bitcoin className="h-5 w-5" />}
          />
        </div>

        {/* Insights Section */}
        <div className="grid gap-6 lg:grid-cols-7">
          <Card className="lg:col-span-4 border-slate-100 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-indigo-600" /> Compliance Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-100 flex gap-5">
                <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-6 w-6 text-amber-600" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between">
                    <h4 className="font-bold text-amber-900">AIS Reconciliation Alert</h4>
                    <Badge variant="outline" className="border-amber-200 text-amber-700">HIGH RISK</Badge>
                  </div>
                  <p className="text-sm text-amber-800/80 mt-1 leading-relaxed">
                    We detected dividends from <strong>HDFC Bank</strong> in your AIS that haven't been declared yet.
                    Declare now to avoid a mismatch notice.
                  </p>
                  <Button variant="link" className="text-amber-800 font-bold p-0 h-auto mt-3 gap-2">
                    Resolve Mismatch <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Advance Tax Progress */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-black text-slate-900 flex items-center gap-2 uppercase tracking-tighter italic">
                    <Calendar className="h-4 w-4 text-indigo-600" /> Advance Tax Roadmap
                  </span>
                  <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-none">Next Due: March 15</Badge>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <Installment status="paid" date="Jun 15" installment="1" />
                  <Installment status="paid" date="Sep 15" installment="2" />
                  <Installment status="paid" date="Dec 15" installment="3" />
                  <Installment status="pending" date="Mar 15" installment="4" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-3 space-y-6">
            <Card className="bg-rose-50/20 border-rose-100 shadow-sm overflow-hidden">
              <CardHeader className="pb-3 border-b border-rose-100/50 bg-rose-50/30">
                <CardTitle className="text-sm font-black text-rose-900 flex items-center gap-2 uppercase tracking-widest">
                  <Users className="h-4 w-4" /> Family Quick Switch
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <FamilyMember name="Rahul Sharma" role="Self" active />
                <FamilyMember name="Priya Sharma" role="Spouse" />
                <FamilyMember name="Om Prakash" role="Parent" />
                <Button variant="ghost" className="w-full text-xs h-10 text-rose-600 hover:bg-rose-100/50 mt-1 font-bold">
                  Manage Family Group
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 text-white shadow-2xl border-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-indigo-400" /> AI Tax Guru
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-[11px] text-white/70 max-h-[150px] overflow-y-auto custom-scrollbar">
                  {asking ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
                      <span>Consulting Section 80...</span>
                    </div>
                  ) : aiResponse ? (
                    <p className="whitespace-pre-wrap">{aiResponse}</p>
                  ) : (
                    <p className="italic">"How do I handle losses from Crypto futures in my ITR-3?"</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ask anything..."
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAskAI()}
                    className="text-xs bg-white/5 border-white/10 text-white placeholder:text-white/30 h-10"
                  />
                  <Button
                    size="icon"
                    onClick={handleAskAI}
                    disabled={asking}
                    className="h-10 w-10 shrink-0 bg-indigo-600 hover:bg-indigo-700"
                  >
                    {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Footer Stats */}
        <div className="flex flex-wrap gap-12 pt-4 border-t">
          <FooterStat label="Trust Score" value="98.5%" icon={<ShieldCheck className="h-4 w-4 text-accent" />} />
          <FooterStat label="Data Residency" value="India (Mumbai)" icon={<FileText className="h-4 w-4 text-primary" />} />
          <FooterStat label="Total Tax Saved" value="₹1.2L" icon={<TrendingUp className="h-4 w-4 text-accent" />} />
        </div>
      </div>
    </AppLayout>
  );
}

function ModuleCard({ title, desc, value, sub, badge, color, link, icon }: any) {
  return (
    <Card className={`relative overflow-hidden border-t-4 border-t-${color} card-hover shadow-sm`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2 text-slate-500">
            <div className={`p-1.5 rounded-lg bg-${color}/10 text-${color}`}>{icon}</div>
            {title}
          </CardTitle>
          <Badge variant="outline" className={`text-${color} border-${color}/20 text-[10px]`}>{badge}</Badge>
        </div>
        <CardDescription className="text-xs mt-1">{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{sub}</p>
            <p className="text-2xl font-black">{value}</p>
          </div>
        </div>
        <Button asChild variant="secondary" className="w-full text-xs font-bold h-10 bg-slate-50 hover:bg-slate-100 border border-slate-100">
          <Link to={link}>Go to Module</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

const Installment = ({ status, date, installment }: any) => (
  <div className={`p-4 rounded-2xl text-center border transition-all ${status === 'paid'
    ? 'bg-emerald-500 text-white border-emerald-600 shadow-lg shadow-emerald-100'
    : 'bg-white border-slate-200 text-slate-400'
    }`}>
    <p className="text-[9px] font-black opacity-60 uppercase mb-1">Q{installment}</p>
    <p className="text-[11px] font-bold">{date}</p>
    <CheckCircle2 className={`h-3 w-3 mx-auto mt-2 ${status === 'paid' ? 'block' : 'hidden'}`} />
  </div>
);

const FamilyMember = ({ name, role, active }: any) => (
  <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${active
    ? 'bg-rose-500 text-white border-rose-600 shadow-lg shadow-rose-100'
    : 'hover:bg-rose-50 border-transparent text-slate-700'
    }`}>
    <div className="flex items-center gap-3">
      <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-black ${active ? 'bg-white/20' : 'bg-rose-100 text-rose-700'
        }`}>
        {name[0]}
      </div>
      <div>
        <p className="font-bold text-sm tracking-tight">{name}</p>
        <p className={`text-[10px] font-medium ${active ? 'text-white/70' : 'text-slate-400'}`}>{role}</p>
      </div>
    </div>
    {active && <Badge className="h-5 text-[9px] bg-white text-rose-600 font-black tracking-tighter">ACTIVE</Badge>}
  </div>
);

const FooterStat = ({ label, value, icon }: any) => (
  <div className="flex items-center gap-4">
    <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
      {icon}
    </div>
    <div>
      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black leading-none">{label}</p>
      <p className="text-base font-black text-slate-900 mt-1.5">{value}</p>
    </div>
  </div>
);
