//
//  ClimbSetApp.swift
//  ClimbSet
//
//  Created by Ian Rapko on 3/5/26.
//

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

@main
struct ClimbSetApp: App {
    init() {
        #if canImport(UIKit)
        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = UIColor(AppColor.background)
        tabAppearance.shadowColor = UIColor(AppColor.border)
        tabAppearance.stackedLayoutAppearance.normal.iconColor = UIColor(AppColor.muted)
        tabAppearance.stackedLayoutAppearance.normal.titleTextAttributes = [
            .foregroundColor: UIColor(AppColor.muted)
        ]
        tabAppearance.stackedLayoutAppearance.selected.iconColor = UIColor(AppColor.primary)
        tabAppearance.stackedLayoutAppearance.selected.titleTextAttributes = [
            .foregroundColor: UIColor(AppColor.primary)
        ]
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance
        UITabBar.appearance().tintColor = UIColor(AppColor.primary)

        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithOpaqueBackground()
        navAppearance.backgroundColor = UIColor(AppColor.background)
        navAppearance.shadowColor = UIColor(AppColor.border)
        navAppearance.titleTextAttributes = [
            .foregroundColor: UIColor(AppColor.text)
        ]
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
        UINavigationBar.appearance().tintColor = UIColor(AppColor.primary)
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
