import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Users,
    UserPlus,
    ShieldCheck,
    LayoutDashboard,
    ArrowRightLeft,
    Settings2,
    AlertCircle
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export default function FamilyDashboard() {
    const [members, setMembers] = useState([
        { id: 1, name: "Rahul Sharma", role: "Head", pan: "ABCDE1234F", status: "Submitted", active: true },
        { id: 2, name: "Priya Sharma", role: "Spouse", pan: "FGHIJ5678K", status: "In Progress", active: false },
        { id: 3, name: "Om Prakash Sharma", role: "Parent", pan: "KLMNO9012P", status: "Action Required", active: false },
    ]);

    return (
        <AppLayout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <Users className="h-8 w-8 text-rose-500" />
                            Family Group Dashboard
                        </h1>
                        <p className="text-muted-foreground italic">Manage tax compliance for your entire household from one place.</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" className="gap-2">
                            <LayoutDashboard className="h-4 w-4" /> Group Overview
                        </Button>
                        <Button className="gap-2 bg-rose-600 hover:bg-rose-700 text-white">
                            <UserPlus className="h-4 w-4" /> Add Member
                        </Button>
                    </div>
                </div>

                {/* Family Grid */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {members.map((member) => (
                        <Card key={member.id} className={`relative overflow-hidden border-2 transition-all ${member.active ? 'border-rose-500 shadow-rose-100 shadow-xl' : 'hover:border-rose-200'}`}>
                            {member.active && (
                                <div className="absolute top-0 right-0 p-2">
                                    <Badge className="bg-rose-500">Currently Active</Badge>
                                </div>
                            )}
                            <CardHeader className="pb-4">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-12 w-12 border-2 border-rose-500/20">
                                        <AvatarFallback className="bg-rose-50 bg-rose-500/10 text-rose-700 font-bold">
                                            {member.name.split(' ').map(n => n[0]).join('')}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <CardTitle className="text-lg">{member.name}</CardTitle>
                                        <CardDescription className="text-xs flex items-center gap-2">
                                            <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{member.pan}</span>
                                            • {member.role}
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                                    <span className="text-xs font-medium text-muted-foreground uppercase">Filing Status</span>
                                    <Badge variant={member.status === 'Submitted' ? 'default' : member.status === 'Action Required' ? 'destructive' : 'secondary'}>
                                        {member.status}
                                    </Badge>
                                </div>

                                {member.status === 'Action Required' && (
                                    <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-100 italic">
                                        <AlertCircle className="h-3 w-3" /> AIS mismatch found. Verification needed.
                                    </div>
                                )}

                                <div className="pt-2 flex gap-2">
                                    <Button variant={member.active ? "secondary" : "outline"} className="flex-1 text-xs h-9">
                                        <ArrowRightLeft className="mr-2 h-3 w-3" /> {member.active ? 'Viewing' : 'Switch To'}
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-9 w-9 border border-input">
                                        <Settings2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    {/* Add New Empty State */}
                    <Card className="border-dashed border-2 flex flex-col items-center justify-center py-10 opacity-60 hover:opacity-100 cursor-pointer transition-opacity bg-muted/5">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                            <UserPlus className="h-6 w-6" />
                        </div>
                        <p className="text-sm font-bold">Connect Spouse/Parent</p>
                        <p className="text-[10px] text-muted-foreground mt-1 px-4 text-center">Manage their investments and file ITR jointly.</p>
                    </Card>
                </div>

                {/* Security Info */}
                <div className="bg-rose-50/30 border border-rose-100 p-6 rounded-2xl flex gap-6 items-center">
                    <div className="h-12 w-12 bg-rose-100 rounded-full flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-6 w-6 text-rose-600" />
                    </div>
                    <div>
                        <h4 className="font-bold text-rose-900">Privacy & Controlled Access</h4>
                        <p className="text-xs text-rose-800/80 mt-1 max-w-2xl leading-relaxed">
                            Adding a family member requires their one-time PAN consent. You can choose to have "Full Access" or only "Visibility Access" for their tax documents.
                            TaxMitra ensures data isolation within the group based on role permissions.
                        </p>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
