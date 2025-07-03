"use client";
import React from 'react';
import Link from 'next/link';
import AnimatedSection from '@/components/AnimatedSection';

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 text-center">
      <AnimatedSection>
        <div className="py-20 md:py-32">
          <h1 className="text-5xl md:text-7xl font-extrabold text-white leading-tight mb-6">
            Decentralized Lending, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
              Reimagined.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto mb-10">
            LendingPool offers a secure and efficient platform to supply and borrow digital assets. Earn interest on your deposits and leverage your holdings with competitive rates.
          </p>
          <div className="flex justify-center items-center gap-4">
            <Link href="/app" passHref>
              <span className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-full text-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-indigo-500/30">
                Launch App
              </span>
            </Link>
            <Link href="#features" passHref>
              <span className="border-2 border-gray-600 hover:bg-gray-800 text-gray-300 font-bold py-3 px-8 rounded-full text-lg transition-all duration-300">
                Learn More
              </span>
            </Link>
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection>
        <div id="features" className="py-20">
          <h2 className="text-4xl font-bold text-white mb-12">Why Choose LendingPool?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-gray-800/50 p-8 rounded-xl border border-gray-700 transition-all duration-300 hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-500/20">
              <h3 className="text-2xl font-bold text-white mb-4">Robust Security</h3>
              <p className="text-gray-400">Audited smart contracts and a non-custodial protocol ensure your funds are always safe and under your control.</p>
            </div>
            <div className="bg-gray-800/50 p-8 rounded-xl border border-gray-700 transition-all duration-300 hover:border-purple-500 hover:shadow-2xl hover:shadow-purple-500/20">
              <h3 className="text-2xl font-bold text-white mb-4">Competitive Rates</h3>
              <p className="text-gray-400">Our dynamic interest rate model provides attractive APYs for suppliers and low-cost borrowing for users.</p>
            </div>
            <div className="bg-gray-800/50 p-8 rounded-xl border border-gray-700 transition-all duration-300 hover:border-pink-500 hover:shadow-2xl hover:shadow-pink-500/20">
              <h3 className="text-2xl font-bold text-white mb-4">Decentralized Governance</h3>
              <p className="text-gray-400">LendingPool is governed by its community, allowing token holders to vote on the future of the protocol.</p>
            </div>
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}
