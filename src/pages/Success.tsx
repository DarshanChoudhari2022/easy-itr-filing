import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    CheckCircle2,
    Download,
    ArrowRight,
    Mail,
    ShieldCheck,
    PartyPopper,
    FileText
} from "lucide-react";
import { motion } from "framer-motion";

export default function Success() {
    return (
        <AppLayout>
            <div className="max-w-3xl mx-auto py-12">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="text-center space-y-8"
                >
                    <div className="relative inline-block">
                        <div className="absolute inset-0 bg-emerald-500 blur-3xl opacity-20 animate-pulse"></div>
                        <div className="relative h-24 w-24 bg-emerald-500 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-emerald-200">
                            <PartyPopper className="h-12 w-12 text-white" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h1 className="text-4xl font-black tracking-tight text-slate-900">ITR Submission Successful!</h1>
                        <p className="text-xl text-slate-500 font-medium">Your tax data has been optimized and the ITR JSON is generated.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 pt-8">
                        <Card className="border-2 border-emerald-100 bg-emerald-50/10 overflow-hidden group hover:shadow-xl transition-all">
                            <CardContent className="p-8 space-y-4">
                                <div className="h-12 w-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                                    <Download className="h-6 w-6" />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-bold text-lg">Download ITR JSON</h3>
                                    <p className="text-sm text-slate-500">Ready for upload on the Income Tax Portal.</p>
                                </div>
                                <Button className="w-full bg-slate-900 group-hover:bg-emerald-600 transition-colors h-12 rounded-xl">Download Now</Button>
                            </CardContent>
                        </Card>

                        <Card className="border-2 border-indigo-100 bg-indigo-50/10 overflow-hidden group hover:shadow-xl transition-all">
                            <CardContent className="p-8 space-y-4">
                                <div className="h-12 w-12 rounded-xl bg-indigo-500 text-white flex items-center justify-center">
                                    <Mail className="h-6 w-6" />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-bold text-lg">Email Confirmation</h3>
                                    <p className="text-sm text-slate-500">We've sent the summary to your registered email.</p>
                                </div>
                                <Button variant="outline" className="w-full border-2 border-indigo-100 group-hover:bg-indigo-50 transition-colors h-12 rounded-xl">Resend Email</Button>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center shadow-inner">
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div className="text-left">
                                <p className="font-bold text-slate-900">TaxBay Audit Archive</p>
                                <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Secured for 8 Years (Section 149)</p>
                            </div>
                        </div>
                        <Button asChild variant="link" className="text-indigo-600 font-bold p-0">
                            <Link to="/vault" className="flex items-center gap-2">Visit Tax Vault <ArrowRight className="h-4 w-4" /></Link>
                        </Button>
                    </div>

                    <div className="pt-8 flex flex-col sm:flex-row gap-4 justify-center">
                        <Button asChild size="lg" variant="ghost" className="rounded-2xl h-14 px-8">
                            <Link to="/dashboard">Back to Cockpit</Link>
                        </Button>
                        <Button asChild size="lg" className="bg-indigo-600 hover:bg-indigo-700 rounded-2xl h-14 px-10 shadow-xl shadow-indigo-100">
                            <Link to="/audit">View Activity Log <ArrowRight className="ml-2 h-4 w-4" /></Link>
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AppLayout>
    );
}
