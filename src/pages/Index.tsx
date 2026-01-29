import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Zap,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  Lock,
  Globe,
  Bitcoin,
  Building,
  Menu,
  X
} from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";

export default function Index() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 200], [1, 0]);
  const y = useTransform(scrollY, [0, 200], [0, -50]);

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden selection:bg-indigo-100 selection:text-indigo-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-10 w-10 bg-gradient-to-tr from-indigo-600 to-indigo-400 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-black tracking-tighter text-slate-900">Tax<span className="text-indigo-600">Bay</span></span>
            </Link>

            <div className="hidden md:flex items-center gap-10">
              <NavLinks />
              <div className="h-6 w-px bg-slate-200"></div>
              <Button asChild variant="ghost" className="font-semibold text-slate-600 hover:text-indigo-600">
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button asChild className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 px-6 py-6 h-auto text-base rounded-2xl">
                <Link to="/auth?signup=true">Get Started <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>

            <button className="md:hidden p-2 text-slate-600" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden bg-white border-b px-6 py-8 space-y-6"
          >
            <NavLinks mobile />
            <div className="pt-6 border-t flex flex-col gap-4">
              <Button asChild variant="outline" className="w-full py-6 rounded-xl">
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button asChild className="w-full bg-indigo-600 py-6 rounded-xl shadow-lg shadow-indigo-50">
                <Link to="/auth?signup=true">Get Started</Link>
              </Button>
            </div>
          </motion.div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-32 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[800px] pointer-events-none -z-10">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-100/40 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[20%] right-[-5%] w-[40%] h-[40%] bg-rose-50/40 rounded-full blur-[100px]"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-8 max-w-4xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-sm font-bold tracking-tight">
              <Zap className="h-4 w-4 fill-indigo-500 text-indigo-500" />
              Revolutionizing Indian Tax Compliance
            </div>

            <h1 className="text-6xl md:text-8xl font-black tracking-tight text-slate-900 leading-[1.05]">
              The Operating System <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-indigo-600 via-indigo-500 to-rose-500 text-glow">for Indian Taxes.</span>
            </h1>

            <p className="text-xl md:text-2xl text-slate-600 font-medium leading-relaxed max-w-3xl mx-auto">
              GST Intelligence, Crypto Tax (115BBH), and Systematic ITR Filing—all powered by AI.
              Designed for CA Firms and Enterprising Indians.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-10">
              <Button asChild size="lg" className="bg-slate-900 hover:bg-slate-800 text-white px-10 py-8 h-auto text-lg rounded-3xl shadow-2xl shadow-slate-200">
                <Link to="/auth?signup=true">Start Free Filing <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="px-10 py-8 h-auto text-lg rounded-3xl border-2 hover:bg-white/50">
                <Link to="/guided">Watch Demo</Link>
              </Button>
            </div>

            <div className="flex items-center justify-center gap-8 pt-12 text-slate-400 grayscale opacity-70">
              <div className="flex items-center gap-2 font-bold"><Shield className="h-5 w-5" /> SOC2 COMPLIANT</div>
              <div className="flex items-center gap-2 font-bold"><Lock className="h-5 w-5" /> AES-256 SECURED</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-24 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-20">
            <h2 className="text-4xl font-black tracking-tight text-slate-900">End-to-End Compliance. Simple.</h2>
            <p className="text-slate-500 font-medium">Solve complex tax problems with zero manual effort.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            <FeatureCard
              icon={<Building className="h-10 w-10 text-indigo-500" />}
              title="GST Intelligence"
              desc="Automatic GSTR-2B reconciliation, ITC optimization, and direct e-invoicing integrated into your workflow."
            />
            <FeatureCard
              icon={<Bitcoin className="h-10 w-10 text-amber-500" />}
              title="Crypto Engine"
              desc="FIFO based per-token calculations strictly adhering to Section 115BBH. Import from Binance, CoinDCX & Zerodha."
            />
            <FeatureCard
              icon={<Globe className="h-10 w-10 text-rose-500" />}
              title="Global Compliance"
              desc="Seamless Schedule FA declarations for US Stocks/RSUs and DTAA relief for foreign income."
            />
          </div>
        </div>
      </section>

      {/* Trust & Reassurance */}
      <section className="py-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-indigo-600 rounded-[3rem] p-12 md:p-20 text-white flex flex-col md:flex-row items-center gap-12 relative overflow-hidden shadow-2xl shadow-indigo-200">
            <div className="absolute top-0 right-0 w-[40%] h-full bg-indigo-500 skew-x-12 opacity-50 -z-0"></div>

            <div className="space-y-6 relative z-10 md:w-1/2">
              <h3 className="text-4xl md:text-5xl font-black leading-tight">Advanced Protection from IT Notices</h3>
              <p className="text-indigo-100 text-lg">
                Our AI cross-references your AIS/TIS data in real-time, flagging potential mismatches before the Income Tax Department does.
              </p>
              <ul className="space-y-4 pt-4">
                <li className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-indigo-300" /> Real-time AIS/26AS Reconciliation</li>
                <li className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-indigo-300" /> Automated Schedule FA (Foreign Assets)</li>
                <li className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-indigo-300" /> Section 115BBH Crypto Audit</li>
              </ul>
            </div>

            <div className="md:w-1/2 relative z-10 flex justify-center">
              <div className="p-8 bg-white/10 backdrop-blur-3xl rounded-[2rem] border border-white/20 shadow-2xl w-full max-w-sm">
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">Filing Status</span>
                    <Badge className="bg-emerald-400 text-emerald-950">OPTIMIZED</Badge>
                  </div>
                  <div className="h-px bg-white/20"></div>
                  <div className="flex justify-between">
                    <span className="text-white/60 text-sm">Potential Refund</span>
                    <span className="text-2xl font-black text-emerald-300">₹45,200</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-white/60">
                      <span>Audit Readiness</span>
                      <span>98%</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full">
                      <div className="h-full bg-white rounded-full w-[98%] shadow-[0_0_10px_white]"></div>
                    </div>
                  </div>
                  <Button className="w-full bg-white text-indigo-600 hover:bg-slate-50 font-black h-14 rounded-2xl shadow-xl">CLAIM REFUND NOW</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 pt-20 pb-12 text-slate-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-12 pb-20">
            <div className="space-y-6 col-span-1 md:col-span-1">
              <Link to="/" className="flex items-center gap-2">
                <div className="h-8 w-8 bg-white rounded-lg flex items-center justify-center">
                  <Shield className="h-5 w-5 text-slate-900" />
                </div>
                <span className="text-xl font-black text-white">TaxBay</span>
              </Link>
              <p className="text-sm text-slate-500 leading-relaxed font-medium">
                The comprehensive tax intelligence platform designed for the modern Indian economy. Trusted by 200+ CA Firms.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-white mb-6">Tax Solutions</h4>
              <ul className="space-y-4 text-sm font-medium">
                <li><Link to="/gst" className="hover:text-white transition-colors">GST Center</Link></li>
                <li><Link to="/crypto" className="hover:text-white transition-colors">Crypto Tax (115BBH)</Link></li>
                <li><Link to="/foreign" className="hover:text-white transition-colors">Foreign Assets (Sch FA)</Link></li>
                <li><Link to="/income" className="hover:text-white transition-colors">ITR Planning</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-6">Professionals</h4>
              <ul className="space-y-4 text-sm font-medium">
                <li><Link to="/clients" className="hover:text-white transition-colors">Client Hub</Link></li>
                <li><Link to="/audit" className="hover:text-white transition-colors">Audit Repository</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">SaaS for CA Firms</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">API for Neo-banks</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-6">Company</h4>
              <ul className="space-y-4 text-sm font-medium">
                <li><Link to="/" className="hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">Security Standards</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">Help Center</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-12 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-xs text-slate-500">© 2026 TaxBay Technologies Private Limited. All rights reserved.</p>
            <div className="flex gap-6 text-slate-500 hover:text-slate-400">
              <Globe className="h-5 w-5" />
              <TrendingUp className="h-5 w-5" />
              <Shield className="h-5 w-5" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavLinks({ mobile }: { mobile?: boolean }) {
  const classes = mobile ? "flex flex-col gap-6" : "flex items-center gap-10";
  const linkClasses = "font-bold text-sm text-slate-600 hover:text-indigo-600 transition-colors uppercase tracking-wider";

  return (
    <div className={classes}>
      <Link to="/gst" className={linkClasses}>GST Center</Link>
      <Link to="/crypto" className={linkClasses}>Crypto Tax</Link>
      <Link to="/foreign" className={linkClasses}>Global Compliance</Link>
      <Link to="/clients" className={linkClasses}>Professionals</Link>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: any, title: string, desc: string }) {
  return (
    <div className="p-10 rounded-[2.5rem] border-2 border-slate-50 bg-slate-50/10 hover:bg-white hover:border-indigo-100 hover:shadow-2xl hover:shadow-indigo-100 transition-all group">
      <div className="mb-6 p-4 inline-block bg-white rounded-2xl shadow-sm group-hover:scale-110 transition-transform">{icon}</div>
      <h3 className="text-xl font-black text-slate-900 mb-4">{title}</h3>
      <p className="text-slate-500 text-sm font-medium leading-relaxed">{desc}</p>
    </div>
  );
}

function Badge({ children, className }: any) {
  return (
    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${className}`}>
      {children}
    </span>
  );
}
