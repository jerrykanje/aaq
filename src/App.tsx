import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from './config/firebase';
import { SplashScreen } from './pages/SplashScreen';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { YourRoute } from './pages/YourRoute';
import { Rides } from './pages/Rides';
import { Account } from './pages/Account';
import { PersonalInfo } from './pages/PersonalInfo';
import { LoginSecurity } from './pages/LoginSecurity';
import { SelectRide } from './pages/SelectRide';
import { ConfirmOrder } from './pages/ConfirmOrder';
import { WaitingForDriver } from './pages/WaitingForDriver';
import { DriverComing } from './pages/DriverComing';
import { ScheduleRide } from './pages/ScheduleRide';
import { ScheduleYourRoute } from './pages/ScheduleYourRoute';
import { ScheduleConfirm } from './pages/ScheduleConfirm';
import { WhatWentWrong } from './pages/WhatWentWrong';
import { AletwendeSend } from './pages/AletwendeSend';
import { Shop } from './pages/Shop';
import { OrderFoodies } from './pages/OrderFoodies';
import { OrderClothes } from './pages/OrderClothes';
import { OrderHardware } from './pages/OrderHardware';
import { FoodiesRoute } from './pages/FoodiesRoute';
import { FoodDelivery } from './pages/FoodDelivery';
import { OrderTrackingPage } from './pages/OrderTrackingPage';
import { LiveTrackingPage } from './pages/LiveTrackingPage';
import { MessageProvider } from './contexts/MessageContext';
import { RideProvider } from './contexts/RideContext';
import { OrderSessionProvider } from './contexts/OrderSessionContext';
import { FoodOrderSessionProvider } from './contexts/FoodOrderSession';
import { GlobalCartProvider } from './contexts/GlobalCartContext';
import { CurrentRideBar } from './components/CurrentRideBar';
import { WaitingForDriverBar } from './components/WaitingForDriverBar';
import { RatingModal } from './components/RatingModal';
import { PageTransition } from './components/PageTransition';
import { useUserProfile } from './hooks/useUserProfile';
import { useFirebaseRide } from './hooks/useFirebaseRide';
import { firebaseService } from './services/firebaseService';
import { getETA } from './utils/etaCalculation';

interface AppState {
  selectedDestination: string;
  selectedPickup: string;
  selectedStops: string[];
  selectedCarType: string;
  selectedPrice: number;
  currentRideId: string | null;
}

function AppContent({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useUserProfile(userId);

  const [appState, setAppState] = useState<AppState>({
    selectedDestination: '',
    selectedPickup: 'Current Location',
    selectedStops: [],
    selectedCarType: '',
    selectedPrice: 0,
    currentRideId: localStorage.getItem('currentRideId'),
  });

  const { currentRide } = useFirebaseRide(appState.currentRideId);
  const [rideStatus, setRideStatus] = useState<string | null>(null);
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [eta, setEta] = useState('3 mins');
  const [showRatingModal, setShowRatingModal] = useState(false);

  // Startup location permission, GPS detection, live position watching and
  // throttled reverse geocoding are now owned by the global LocationProvider
  // (wired in main.tsx). Pages read it via useGeolocation / useLocation.

  useEffect(() => {
    const rideId = localStorage.getItem('currentRideId');
    if (rideId) {
      setAppState(prev => ({ ...prev, currentRideId: rideId }));
      navigate('/');
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      console.log('Back online, syncing ride state...');
      const rideId = localStorage.getItem('currentRideId');
      if (rideId) {
        setAppState(prev => ({ ...prev, currentRideId: rideId }));
        navigate('/');
      }
    };

    const handleOffline = () => {
      console.warn('No internet connection. Reconnecting when available...');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [navigate]);

  useEffect(() => {
    if (!appState.currentRideId) return;

    const unsubscribe = firebaseService.listenToRideStatus(appState.currentRideId, (statusData) => {
      if (statusData) {
        setRideStatus(statusData.status);

        if (statusData.status === 'pending' && location.pathname !== '/waiting-for-driver') {
          navigate('/waiting-for-driver');
        }

        if (statusData.status === 'accepted' && location.pathname !== '/driver-coming') {
          navigate('/driver-coming');
        }

        if (statusData.status === 'arrived' || statusData.status === 'in_progress') {
          if (location.pathname !== '/driver-coming') {
            navigate('/driver-coming');
          }
        }

        if (statusData.status === 'completed') {
          setShowRatingModal(true);
        }
      }
    });

    return () => unsubscribe();
  }, [appState.currentRideId, location.pathname, navigate]);

  useEffect(() => {
    if (currentRide?.driverId) {
      firebaseService.getDriverInfo(currentRide.driverId).then((driver) => {
        if (driver) {
          setDriverInfo(driver);
        }
      });
    }
  }, [currentRide?.driverId]);

  const handleRouteComplete = (pickup: string, destination: string, stops: string[]) => {
    setAppState(prev => ({
      ...prev,
      selectedPickup: pickup,
      selectedDestination: destination,
      selectedStops: stops
    }));
  };

  const handleSearchSelect = (address: string) => {
    if (isRideActive()) {
      alert('You already have an active ride.');
      navigate('/driver-coming');
      return;
    }
    setAppState(prev => ({ ...prev, selectedDestination: address }));
    navigate('/select-ride');
  };

  const handleRideSelect = (carType: string, price: number) => {
    if (isRideActive()) {
      alert('You already have an active ride.');
      navigate('/driver-coming');
      return;
    }
    setAppState(prev => ({ ...prev, selectedCarType: carType, selectedPrice: price }));
    navigate('/confirm-order');
  };

  const handleConfirmOrder = () => {
    if (isRideActive()) {
      alert('You already have an active ride.');
      navigate('/driver-coming');
      return;
    }
    navigate('/waiting-for-driver');
  };

  const handleDriverFound = (rideId?: string) => {
    if (rideId) {
      setAppState(prev => ({ ...prev, currentRideId: rideId }));
    }
    navigate('/driver-coming');
  };

  const handleRideCreated = (rideId: string) => {
    localStorage.setItem('currentRideId', rideId);
    setAppState(prev => ({ ...prev, currentRideId: rideId }));
  };

  const handleBack = () => {
    const blockedPaths = ['/waiting-for-driver', '/confirm-order', '/select-ride'];

    if (isRideActive() || isPending()) {
      const message = isPending()
        ? 'You already have an active request.'
        : 'You already have an active ride.';
      const destination = isPending() ? '/waiting-for-driver' : '/driver-coming';

      if (blockedPaths.includes(location.pathname)) {
        alert(message);
        navigate(destination);
        return;
      }

      alert(message);
      navigate(destination);
      return;
    }
    navigate(-1);
  };

  const handleCancelToHome = () => {
    localStorage.removeItem('currentRideId');
    setAppState(prev => ({ ...prev, currentRideId: null }));
    setRideStatus(null);
    navigate('/');
  };

  const handleSubmitRating = async (rating: number, feedback: string) => {
    if (!appState.currentRideId || !currentRide?.driverId || !profile?.id) return;

    try {
      await firebaseService.submitRating(
        currentRide.driverId,
        appState.currentRideId,
        rating,
        feedback,
        profile.id
      );
      localStorage.removeItem('currentRideId');
      setShowRatingModal(false);
      setAppState(prev => ({ ...prev, currentRideId: null }));
      setRideStatus(null);
      navigate('/');
    } catch (error) {
      console.error('Error submitting rating:', error);
    }
  };

  const isRideActive = () => {
    return rideStatus === 'accepted' || rideStatus === 'arrived' || rideStatus === 'in_progress';
  };

  const isPending = () => {
    return rideStatus === 'pending';
  };

  return (
    <GlobalCartProvider>
      <OrderSessionProvider>
        <FoodOrderSessionProvider>
          <MessageProvider userId={profile?.id || null} rideId={appState.currentRideId}>
            <RideProvider rideId={appState.currentRideId}>
          <div className="app">
          <AnimatePresence>
            {isRideActive() && driverInfo && location.pathname !== '/driver-coming' && (
              <CurrentRideBar
                driverName={driverInfo.name}
                carModel={driverInfo.carModel}
                eta={eta}
                status={rideStatus || 'accepted'}
              />
            )}

            {isPending() && location.pathname !== '/waiting-for-driver' && (
              <WaitingForDriverBar />
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route
                path="/"
                element={
                  <PageTransition>
                    <Dashboard
                      onSearchSelect={(address) => {
                        if (isRideActive()) {
                          alert('You already have an active ride.');
                          return;
                        }
                        handleSearchSelect(address);
                      }}
                    />
                  </PageTransition>
                }
              />
              <Route
                path="/your-route"
                element={
                  <PageTransition>
                    {isRideActive() ? (
                      <Dashboard onSearchSelect={() => alert('You already have an active ride.')} />
                    ) : (
                      <YourRoute onRouteComplete={handleRouteComplete} />
                    )}
                  </PageTransition>
                }
              />
              <Route
                path="/rides"
                element={<PageTransition><Rides /></PageTransition>}
              />
              <Route
                path="/account"
                element={<PageTransition><Account /></PageTransition>}
              />
              <Route
                path="/personal-info"
                element={<PageTransition><PersonalInfo /></PageTransition>}
              />
              <Route
                path="/login-security"
                element={<PageTransition><LoginSecurity /></PageTransition>}
              />
              <Route
                path="/schedule-ride"
                element={<PageTransition><ScheduleRide /></PageTransition>}
              />
              <Route
                path="/schedule-your-route"
                element={<PageTransition><ScheduleYourRoute /></PageTransition>}
              />
              <Route
                path="/schedule-confirm"
                element={<PageTransition><ScheduleConfirm /></PageTransition>}
              />
              <Route
                path="/what-went-wrong"
                element={<PageTransition><WhatWentWrong /></PageTransition>}
              />
              <Route
                path="/aletwende-send"
                element={<PageTransition><AletwendeSend /></PageTransition>}
              />
              <Route
                path="/shop"
                element={<PageTransition><Shop /></PageTransition>}
              />
              <Route
                path="/order-foodies/:storeId"
                element={<PageTransition><OrderFoodies /></PageTransition>}
              />
              <Route
                path="/order-clothes/:storeId"
                element={<PageTransition><OrderClothes /></PageTransition>}
              />
              <Route
                path="/order-hardware/:storeId"
                element={<PageTransition><OrderHardware /></PageTransition>}
              />
              <Route
                path="/foodies-route"
                element={<PageTransition><FoodiesRoute /></PageTransition>}
              />
              <Route
                path="/food-delivery"
                element={<PageTransition><FoodDelivery /></PageTransition>}
              />
              <Route
                path="/order-tracking"
                element={<PageTransition><OrderTrackingPage /></PageTransition>}
              />
              <Route
                path="/live-tracking"
                element={<PageTransition><LiveTrackingPage /></PageTransition>}
              />
              <Route
                path="/select-ride"
                element={
                  <PageTransition>
                    {isRideActive() ? (
                      <Dashboard onSearchSelect={() => alert('You already have an active ride.')} />
                    ) : (
                      <SelectRide
                        destination={appState.selectedDestination}
                        pickup={appState.selectedPickup}
                        stops={appState.selectedStops}
                        onBack={handleBack}
                        onSelectRide={handleRideSelect}
                      />
                    )}
                  </PageTransition>
                }
              />
              <Route
                path="/confirm-order"
                element={
                  <PageTransition>
                    {isRideActive() || isPending() ? (
                      <Dashboard onSearchSelect={() => alert('You already have an active ride.')} />
                    ) : (
                      <ConfirmOrder
                        destination={appState.selectedDestination}
                        pickup={appState.selectedPickup}
                        stops={appState.selectedStops}
                        carType={appState.selectedCarType}
                        price={appState.selectedPrice}
                        onBack={handleBack}
                        onRideConfirmed={handleConfirmOrder}
                        onRideCreated={handleRideCreated}
                      />
                    )}
                  </PageTransition>
                }
              />
              <Route
                path="/waiting-for-driver"
                element={
                  <PageTransition>
                    <WaitingForDriver
                      destination={appState.selectedDestination}
                      pickup={appState.selectedPickup}
                      stops={appState.selectedStops}
                      carType={appState.selectedCarType}
                      price={appState.selectedPrice}
                      currentRideId={appState.currentRideId}
                      onCancel={handleCancelToHome}
                      onDriverFound={handleDriverFound}
                    />
                  </PageTransition>
                }
              />
              <Route
                path="/driver-coming"
                element={
                  <PageTransition>
                    <DriverComing
                      destination={appState.selectedDestination}
                      pickup={appState.selectedPickup}
                      stops={appState.selectedStops}
                      carType={appState.selectedCarType}
                      price={appState.selectedPrice}
                      currentRideId={appState.currentRideId}
                      onBack={handleCancelToHome}
                    />
                  </PageTransition>
                }
              />
            </Routes>
          </AnimatePresence>

          {showRatingModal && driverInfo && (
            <RatingModal
              isOpen={showRatingModal}
              onClose={() => {}}
              driverName={driverInfo.name}
              driverPhoto={driverInfo.photo}
              onSubmitRating={handleSubmitRating}
            />
          )}
        </div>
          </RideProvider>
          </MessageProvider>
        </FoodOrderSessionProvider>
      </OrderSessionProvider>
    </GlobalCartProvider>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [authUser, setAuthUser] = useState<FirebaseUser | null | undefined>(undefined);
  // True from the moment signup creates the Firebase Auth account until the
  // Firestore profile-doc write is confirmed. See Login.tsx's handleSignup —
  // onAuthStateChanged fires as soon as the account exists, before that
  // write finishes, so we hold the authenticated view back until then.
  const [provisioning, setProvisioning] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, setAuthUser);
  }, []);

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  // Auth state still loading — invisible placeholder, no flash
  if (authUser === undefined) {
    return <div className="fixed inset-0 bg-white" />;
  }

  const showAuthedApp = Boolean(authUser) && !provisioning;

  // Authenticated vs unauthenticated views cross-fade so logout isn't jarring
  return (
    <AnimatePresence mode="wait">
      {showAuthedApp ? (
        <motion.div
          key="app"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ minHeight: '100vh' }}
        >
          <Router>
            <AppContent userId={authUser!.uid} />
          </Router>
        </motion.div>
      ) : (
        <motion.div
          key="login"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ minHeight: '100vh' }}
        >
          <Login
            onAuthSuccess={(user) => setAuthUser(user)}
            onProvisioningChange={setProvisioning}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default App;
