/**
 * Settings Page - Account & Privacy Settings
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    User, Lock, Bell, Shield, Eye, EyeOff, Save, Check,
    Smartphone, Mail, Key, AlertTriangle, Loader2, LogOut,
    CreditCard, MapPin, Sparkles
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { isValidPAN, isValidMobile, isValidPincode, INDIAN_STATES } from '@/lib/validators';
import { updateProfileKYC, saveUserData, loadUserData } from '@/lib/supabase-data-service';
import BankDetailsManager from '@/components/BankDetailsManager';

export default function SettingsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { user, signOut } = useAuth();

    // Tab State
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'account');

    // Update URL when tab changes
    const handleTabChange = (val: string) => {
        setActiveTab(val);
        setSearchParams({ tab: val });
    };

    // Sync from URL if it changes externally
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) setActiveTab(tab);
    }, [searchParams]);

    const [saving, setSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Profile settings
    const [profile, setProfile] = useState({
        fullName: '',
        email: '',
        phone: '',
        pan: '',
    });

    // KYC fields
    const [kyc, setKyc] = useState({
        dateOfBirth: '',
        gender: '' as '' | 'M' | 'F' | 'O',
        fatherName: '',
        flatNo: '',
        building: '',
        street: '',
        city: '',
        state: '',
        pincode: '',
    });

    // Password change
    const [passwords, setPasswords] = useState({
        current: '',
        new: '',
        confirm: ''
    });

    // Notification settings
    const [notifications, setNotifications] = useState({
        emailAlerts: true,
        taxReminders: true,
        weeklyDigest: false,
        marketingEmails: false
    });

    // Privacy settings
    const [privacy, setPrivacy] = useState({
        showProfile: true,
        dataSharing: false,
        analyticsTracking: true
    });

    // Load notification & privacy settings from Supabase
    useEffect(() => {
        if (!user) return;
        const loadSettings = async () => {
            try {
                const [dbNotif, dbPriv] = await Promise.all([
                    loadUserData<typeof notifications>('notificationSettings'),
                    loadUserData<typeof privacy>('privacySettings'),
                ]);
                if (dbNotif) setNotifications(dbNotif);
                if (dbPriv) setPrivacy(dbPriv);
            } catch (e) {
                console.warn('[Settings] Failed to load settings from DB:', e);
            }
        };
        loadSettings();
    }, [user]);

    // Load user data
    useEffect(() => {
        if (user) {
            setProfile({
                fullName: user.user_metadata?.full_name || '',
                email: user.email || '',
                phone: user.phone || '',
                pan: user.user_metadata?.pan || '',
            });
            // Load KYC from profiles table
            loadKYC();
        }
    }, [user]);

    const loadKYC = async () => {
        if (!user) return;
        try {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();
            if (data) {
                setKyc({
                    dateOfBirth: (data as any).date_of_birth || '',
                    gender: (data as any).gender || '',
                    fatherName: (data as any).father_name || '',
                    flatNo: (data as any).flat_no || '',
                    building: (data as any).building || '',
                    street: (data as any).street || '',
                    city: (data as any).city || '',
                    state: (data as any).state || '',
                    pincode: (data as any).pincode || '',
                });
                // Also fill PAN from profile if not from auth metadata
                if ((data as any).pan_number && !profile.pan) {
                    setProfile(p => ({ ...p, pan: (data as any).pan_number }));
                }
            }
        } catch (e) {
            console.error('Error loading KYC:', e);
        }
    };

    // Save profile
    const handleSaveProfile = async () => {
        // Validate PAN if provided
        if (profile.pan && !isValidPAN(profile.pan)) {
            toast.error('Invalid PAN format. Expected: ABCDE1234F');
            return;
        }
        if (profile.phone && !isValidMobile(profile.phone.replace(/\D/g, '').slice(-10))) {
            toast.error('Invalid mobile number');
            return;
        }

        setSaving(true);
        try {
            // Update auth metadata
            const { error } = await supabase.auth.updateUser({
                data: {
                    full_name: profile.fullName,
                    pan: profile.pan
                }
            });
            if (error) throw error;

            // Also update profiles table
            try {
                await updateProfileKYC({
                    full_name: profile.fullName,
                    pan_number: profile.pan,
                    mobile: profile.phone.replace(/\D/g, '').slice(-10),
                });
            } catch (e) {
                // Non-critical — profiles table may not exist yet
                console.warn('Could not update profiles table:', e);
            }

            toast.success('Profile updated successfully');
        } catch (err) {
            toast.error('Failed to update profile');
            console.error(err);
        }
        setSaving(false);
    };

    // Change password
    const handleChangePassword = async () => {
        if (passwords.new !== passwords.confirm) {
            toast.error('Passwords do not match');
            return;
        }
        if (passwords.new.length < 8) {
            toast.error('Password must be at least 8 characters');
            return;
        }

        setSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: passwords.new
            });

            if (error) throw error;
            toast.success('Password changed successfully');
            setPasswords({ current: '', new: '', confirm: '' });
        } catch (err) {
            toast.error('Failed to change password');
            console.error(err);
        }
        setSaving(false);
    };

    // Save notification settings (DB + localStorage cache)
    const handleSaveNotifications = async () => {
        localStorage.setItem('notificationSettings', JSON.stringify(notifications));
        try {
            await saveUserData('notificationSettings', notifications);
            toast.success('Notification preferences saved');
        } catch {
            toast.success('Notification preferences saved locally');
        }
    };

    // Save privacy settings (DB + localStorage cache)
    const handleSavePrivacy = async () => {
        localStorage.setItem('privacySettings', JSON.stringify(privacy));
        try {
            await saveUserData('privacySettings', privacy);
            toast.success('Privacy settings saved');
        } catch {
            toast.success('Privacy settings saved locally');
        }
    };

    // Save KYC
    const handleSaveKYC = async () => {
        if (kyc.pincode && !isValidPincode(kyc.pincode)) {
            toast.error('Invalid pincode');
            return;
        }
        setSaving(true);
        try {
            await updateProfileKYC({
                date_of_birth: kyc.dateOfBirth || undefined,
                gender: kyc.gender || undefined,
                father_name: kyc.fatherName || undefined,
                flat_no: kyc.flatNo || undefined,
                building: kyc.building || undefined,
                street: kyc.street || undefined,
                city: kyc.city || undefined,
                state: kyc.state || undefined,
                pincode: kyc.pincode || undefined,
            });
            toast.success('KYC details saved');
        } catch (err: any) {
            toast.error(err.message || 'Failed to save KYC');
        }
        setSaving(false);
    };

    return (
        <AppLayout>
            <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
                    <p className="text-slate-500 mt-1">Manage your account preferences and security</p>
                </div>

                <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                    <TabsList className="grid w-full grid-cols-6 mb-8 overflow-x-auto">
                        <TabsTrigger value="account" className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span className="hidden sm:inline">Account</span>
                        </TabsTrigger>
                        <TabsTrigger value="kyc" className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            <span className="hidden sm:inline">KYC</span>
                        </TabsTrigger>
                        <TabsTrigger value="plan" className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            <span className="hidden sm:inline">Plan</span>
                        </TabsTrigger>

                        <TabsTrigger value="security" className="flex items-center gap-2">
                            <Lock className="h-4 w-4" />
                            <span className="hidden sm:inline">Security</span>
                        </TabsTrigger>
                        <TabsTrigger value="notifications" className="flex items-center gap-2">
                            <Bell className="h-4 w-4" />
                            <span className="hidden sm:inline">Alerts</span>
                        </TabsTrigger>
                        <TabsTrigger value="privacy" className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            <span className="hidden sm:inline">Privacy</span>
                        </TabsTrigger>
                    </TabsList>

                    {/* Account Settings */}
                    <TabsContent value="account">
                        <Card>
                            <CardHeader>
                                <CardTitle>Profile Information</CardTitle>
                                <CardDescription>Update your personal details</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Full Name</Label>
                                        <Input
                                            value={profile.fullName}
                                            onChange={e => setProfile({ ...profile, fullName: e.target.value })}
                                            placeholder="Enter your full name"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Email</Label>
                                        <Input value={profile.email} disabled className="bg-slate-50" />
                                        <p className="text-xs text-slate-500">Email cannot be changed</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Phone Number</Label>
                                        <Input
                                            value={profile.phone}
                                            onChange={e => setProfile({ ...profile, phone: e.target.value })}
                                            placeholder="+91 XXXXX XXXXX"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>PAN Number</Label>
                                        <Input
                                            value={profile.pan}
                                            onChange={e => setProfile({ ...profile, pan: e.target.value.toUpperCase() })}
                                            placeholder="ABCDE1234F"
                                            maxLength={10}
                                        />
                                    </div>
                                </div>

                                <Separator />

                                <div className="flex justify-end">
                                    <Button onClick={handleSaveProfile} disabled={saving}>
                                        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                        Save Changes
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* KYC Tab */}
                    <TabsContent value="kyc">
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <MapPin className="h-5 w-5 text-indigo-600" />
                                        KYC Details
                                    </CardTitle>
                                    <CardDescription>Required for ITR filing. All data is encrypted and stored securely.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Date of Birth</Label>
                                            <Input
                                                type="date"
                                                value={kyc.dateOfBirth}
                                                onChange={e => setKyc({ ...kyc, dateOfBirth: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Gender</Label>
                                            <Select value={kyc.gender} onValueChange={(v: 'M' | 'F' | 'O') => setKyc({ ...kyc, gender: v })}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select gender" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="M">Male</SelectItem>
                                                    <SelectItem value="F">Female</SelectItem>
                                                    <SelectItem value="O">Other</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2 sm:col-span-2">
                                            <Label>Father's Name (as on PAN)</Label>
                                            <Input
                                                value={kyc.fatherName}
                                                onChange={e => setKyc({ ...kyc, fatherName: e.target.value.toUpperCase() })}
                                                placeholder="FATHER'S NAME"
                                            />
                                        </div>
                                    </div>

                                    <Separator />
                                    <h4 className="font-semibold text-sm text-gray-700">Address (as on Aadhaar/PAN)</h4>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Flat / Door No.</Label>
                                            <Input
                                                value={kyc.flatNo}
                                                onChange={e => setKyc({ ...kyc, flatNo: e.target.value })}
                                                placeholder="eg. 301, A-Wing"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Building / Premises</Label>
                                            <Input
                                                value={kyc.building}
                                                onChange={e => setKyc({ ...kyc, building: e.target.value })}
                                                placeholder="eg. Sunshine Apartments"
                                            />
                                        </div>
                                        <div className="space-y-2 sm:col-span-2">
                                            <Label>Street / Road</Label>
                                            <Input
                                                value={kyc.street}
                                                onChange={e => setKyc({ ...kyc, street: e.target.value })}
                                                placeholder="eg. MG Road"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>City / Town</Label>
                                            <Input
                                                value={kyc.city}
                                                onChange={e => setKyc({ ...kyc, city: e.target.value })}
                                                placeholder="eg. Pune"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>State</Label>
                                            <Select value={kyc.state} onValueChange={v => setKyc({ ...kyc, state: v })}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select state" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {INDIAN_STATES.map(s => (
                                                        <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Pincode</Label>
                                            <Input
                                                value={kyc.pincode}
                                                onChange={e => setKyc({ ...kyc, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                                placeholder="411001"
                                                maxLength={6}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-2">
                                        <Button onClick={handleSaveKYC} disabled={saving}>
                                            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                            Save KYC Details
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Bank Details */}
                            <BankDetailsManager />
                        </div>
                    </TabsContent>

                    {/* Plan Settings */}
                    <TabsContent value="plan">
                        <div className="space-y-6">
                            <div className="grid gap-6 md:grid-cols-3">
                                {/* Free Plan */}
                                <Card className="border-slate-200">
                                    <CardHeader>
                                        <CardTitle>Free</CardTitle>
                                        <CardDescription>Essential filing for salary income</CardDescription>
                                        <div className="mt-4 text-3xl font-bold">₹0<span className="text-sm font-normal text-slate-500">/year</span></div>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="space-y-3 text-sm">
                                            <li className="flex items-center"><Check className="h-4 w-4 mr-2 text-green-500" /> ITR-1 Filing</li>
                                            <li className="flex items-center"><Check className="h-4 w-4 mr-2 text-green-500" /> Basic AIS Check</li>
                                            <li className="flex items-center"><Check className="h-4 w-4 mr-2 text-green-500" /> Rent Receipts</li>
                                            <li className="flex items-center"><Check className="h-4 w-4 mr-2 text-green-500" /> Email Support</li>
                                        </ul>
                                        <Button className="w-full mt-6" variant="outline" disabled>Current Plan</Button>
                                    </CardContent>
                                </Card>

                                {/* Pro Plan */}
                                <Card className="border-indigo-600 border-2 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 bg-indigo-600 text-white text-xs px-3 py-1 font-medium rounded-bl-lg">Most Popular</div>
                                    <CardHeader>
                                        <CardTitle className="text-indigo-700">Pro</CardTitle>
                                        <CardDescription>For investors & traders</CardDescription>
                                        <div className="mt-4 text-3xl font-bold">₹1,499<span className="text-sm font-normal text-slate-500">/year</span></div>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="space-y-3 text-sm">
                                            <li className="flex items-center"><Check className="h-4 w-4 mr-2 text-indigo-500" /> All ITR Forms (1-4)</li>
                                            <li className="flex items-center"><Check className="h-4 w-4 mr-2 text-indigo-500" /> Crypto & Stocks (Capital Gains)</li>
                                            <li className="flex items-center"><Check className="h-4 w-4 mr-2 text-indigo-500" /> Full AIS Reconciliation</li>
                                            <li className="flex items-center"><Check className="h-4 w-4 mr-2 text-indigo-500" /> Priority Support</li>
                                        </ul>
                                        <Button className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700">Upgrade to Pro</Button>
                                    </CardContent>
                                </Card>

                                {/* Expert Plan */}
                                <Card className="border-slate-200">
                                    <CardHeader>
                                        <CardTitle>Expert Assisted</CardTitle>
                                        <CardDescription>CA-guided filing & planning</CardDescription>
                                        <div className="mt-4 text-3xl font-bold">₹3,999<span className="text-sm font-normal text-slate-500">/year</span></div>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="space-y-3 text-sm">
                                            <li className="flex items-center"><Check className="h-4 w-4 mr-2 text-green-500" /> Everything in Pro</li>
                                            <li className="flex items-center"><Check className="h-4 w-4 mr-2 text-green-500" /> Dedicated CA Review</li>
                                            <li className="flex items-center"><Check className="h-4 w-4 mr-2 text-green-500" /> Tax Planning Call (30 min)</li>
                                            <li className="flex items-center"><Check className="h-4 w-4 mr-2 text-green-500" /> Notice Management</li>
                                        </ul>
                                        <Button className="w-full mt-6" variant="outline">Contact Sales</Button>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </TabsContent>

                    {/* Security Settings */}
                    <TabsContent value="security">
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Change Password</CardTitle>
                                    <CardDescription>Update your account password</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Current Password</Label>
                                        <div className="relative">
                                            <Input
                                                type={showPassword ? 'text' : 'password'}
                                                value={passwords.current}
                                                onChange={e => setPasswords({ ...passwords, current: e.target.value })}
                                                placeholder="Enter current password"
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-2 top-1/2 -translate-y-1/2"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>New Password</Label>
                                            <Input
                                                type="password"
                                                value={passwords.new}
                                                onChange={e => setPasswords({ ...passwords, new: e.target.value })}
                                                placeholder="Enter new password"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Confirm Password</Label>
                                            <Input
                                                type="password"
                                                value={passwords.confirm}
                                                onChange={e => setPasswords({ ...passwords, confirm: e.target.value })}
                                                placeholder="Confirm new password"
                                            />
                                        </div>
                                    </div>
                                    <Button onClick={handleChangePassword} disabled={saving}>
                                        <Key className="h-4 w-4 mr-2" />
                                        Update Password
                                    </Button>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                        Two-Factor Authentication
                                        <Badge variant="secondary">Coming Soon</Badge>
                                    </CardTitle>
                                    <CardDescription>Add an extra layer of security to your account</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Alert>
                                        <Smartphone className="h-4 w-4" />
                                        <AlertDescription>
                                            Two-factor authentication using authenticator apps will be available soon.
                                        </AlertDescription>
                                    </Alert>
                                </CardContent>
                            </Card>

                            <Card className="border-red-200">
                                <CardHeader>
                                    <CardTitle className="text-red-600">Danger Zone</CardTitle>
                                </CardHeader>
                                <CardContent className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Sign out from all devices</p>
                                        <p className="text-sm text-slate-500">This will log you out everywhere</p>
                                    </div>
                                    <Button variant="destructive" onClick={() => signOut()}>
                                        <LogOut className="h-4 w-4 mr-2" />
                                        Sign Out
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* Notification Settings */}
                    <TabsContent value="notifications">
                        <Card>
                            <CardHeader>
                                <CardTitle>Notification Preferences</CardTitle>
                                <CardDescription>Control how you receive updates</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Email Alerts</p>
                                        <p className="text-sm text-slate-500">Receive important account notifications</p>
                                    </div>
                                    <Switch
                                        checked={notifications.emailAlerts}
                                        onCheckedChange={v => setNotifications({ ...notifications, emailAlerts: v })}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Tax Filing Reminders</p>
                                        <p className="text-sm text-slate-500">Reminders for due dates and deadlines</p>
                                    </div>
                                    <Switch
                                        checked={notifications.taxReminders}
                                        onCheckedChange={v => setNotifications({ ...notifications, taxReminders: v })}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Weekly Digest</p>
                                        <p className="text-sm text-slate-500">Summary of your tax activities</p>
                                    </div>
                                    <Switch
                                        checked={notifications.weeklyDigest}
                                        onCheckedChange={v => setNotifications({ ...notifications, weeklyDigest: v })}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Marketing Emails</p>
                                        <p className="text-sm text-slate-500">Product updates and new features</p>
                                    </div>
                                    <Switch
                                        checked={notifications.marketingEmails}
                                        onCheckedChange={v => setNotifications({ ...notifications, marketingEmails: v })}
                                    />
                                </div>

                                <div className="flex justify-end pt-4">
                                    <Button onClick={handleSaveNotifications}>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Preferences
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Privacy Settings */}
                    <TabsContent value="privacy">
                        <Card>
                            <CardHeader>
                                <CardTitle>Privacy Settings</CardTitle>
                                <CardDescription>Control your data and privacy</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Profile Visibility</p>
                                        <p className="text-sm text-slate-500">Allow CAs to find your profile</p>
                                    </div>
                                    <Switch
                                        checked={privacy.showProfile}
                                        onCheckedChange={v => setPrivacy({ ...privacy, showProfile: v })}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Data Sharing</p>
                                        <p className="text-sm text-slate-500">Share anonymized data for improvements</p>
                                    </div>
                                    <Switch
                                        checked={privacy.dataSharing}
                                        onCheckedChange={v => setPrivacy({ ...privacy, dataSharing: v })}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Analytics Tracking</p>
                                        <p className="text-sm text-slate-500">Help us improve with usage analytics</p>
                                    </div>
                                    <Switch
                                        checked={privacy.analyticsTracking}
                                        onCheckedChange={v => setPrivacy({ ...privacy, analyticsTracking: v })}
                                    />
                                </div>

                                <div className="flex justify-end pt-4">
                                    <Button onClick={handleSavePrivacy}>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Settings
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </AppLayout>
    );
}
